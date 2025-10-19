const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');


dotenv.config();
const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY)

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Environment variables
const PORT = process.env.PORT || 5000;




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@profast.qyed2su.mongodb.net/?retryWrites=true&w=majority&appName=ProFast`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        // DATABASE name and collection
        const parcelCollection = client.db('ParcelDB').collection('Parcels');
        const paymentsCollection = client.db('ParcelDB').collection('Payments');

        // get all parcels api
        app.get('/parcels', async (req, res) => {
            const parcels = await parcelCollection.find().toArray();
            res.send(parcels);
        })

        // GET: All parcels OR parcels by user(created_by), sorted by latest

        app.get('/parcels', async (req, res) => {
            try {
                const userEmail = req.query.email;
                const query = userEmail ? { created_by: userEmail } : {};
                const options = {
                    sort: { createdAt: -1 }, //Newest first
                };
                const parcels = await parcelCollection.find(query, options).toArray();
                res.send(parcels);
            }
            catch (error) {
                console.error('Error fetching parcels:', error);
                res.status(500).send({ message: 'Failed to get parcels' })
            }
        });

        // ✅ GET parcel by specific ID
        app.get("/parcels/:id", async (req, res) => {
            try {
                const id = req.params.id;

                const parcel = await parcelCollection.findOne({ _id: new ObjectId(id) });

                if (!parcel) {
                    return res.status(404).json({ message: "Parcel not found" });
                }

                res.send(parcel);
            } catch (error) {
                console.error("Error fetching parcel by ID:", error);
                res.status(500).json({ message: "Server error", error: error.message });
            }
        });


        // Post: create a new parcel
        app.post('/parcels', async (req, res) => {
            try {
                const newParcel = req.body;
                const result = await parcelCollection.insertOne(newParcel);
                res.status(201).send(result)
            } catch (error) {
                console.error('error inserting parcels:', error);
                res.status(500).send({ message: 'Failed to create parcel' })
            }
        })

        // Delete: delete parcels 
        app.delete('/parcels/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const result = await parcelCollection.deleteOne({ _id: new ObjectId(id) });
                res.send(result);
            }
            catch (error) {
                console.error('Error deleting parcel:', error);
                res.status(500).send({ message: "Failed to delete parcel" })
            }
        });

        app.get('/payments', async (req, res) => {

            try {
                const userEmail = req.query.email;
                // console.log('decocded', req.decoded)
                // if (req.decoded.email !== userEmail) {
                //     return res.status(403).send({ message: 'forbidden access' })
                // }

                const query = userEmail ? { email: userEmail } : {};
                const options = { sort: { paid_at: -1 } }; // Latest first

                const payments = await paymentsCollection.find(query, options).toArray();
                res.send(payments);
            } catch (error) {
                console.error('Error fetching payment history:', error);
                res.status(500).send({ message: 'Failed to get payments' });
            }
        });

        // POST: Record payment and update parcel status
        app.post('/payments', async (req, res) => {
            try {
                const { parcelId, email, amount, paymentMethod, transactionId } = req.body;

                // 1. Update parcel's payment_status
                const updateResult = await parcelCollection.updateOne(
                    { _id: new ObjectId(parcelId) },
                    {
                        $set: {
                            payment_status: 'paid'
                        }
                    }
                );

                if (updateResult.modifiedCount === 0) {
                    return res.status(404).send({ message: 'Parcel not found or already paid' });
                }

                // 2. Insert payment record
                const paymentDoc = {
                    parcelId,
                    email,
                    amount,
                    paymentMethod,
                    transactionId,
                    paid_at_string: new Date().toISOString(),
                    paid_at: new Date(),
                };

                const paymentResult = await paymentsCollection.insertOne(paymentDoc);

                res.status(201).send({
                    message: 'Payment recorded and parcel marked as paid',
                    insertedId: paymentResult.insertedId,
                });

            } catch (error) {
                console.error('Payment processing failed:', error);
                res.status(500).send({ message: 'Failed to record payment' });
            }
        });

        app.post('/create-payment-intent', async (req, res) => {
            const amountInCents = req.body.amountInCents
            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amountInCents, // amount in cents
                    currency: "usd",
                    payment_method_types: ['card'],
                });
                res.json({ clientSecret: paymentIntent.client_secret })
            } catch (error) {
                res.status(500).json({ error: error.message })
            }
        })


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



// Basic route
app.get("/", (req, res) => {
    res.send("ProFast Parcel API is running 🚀");
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
});
