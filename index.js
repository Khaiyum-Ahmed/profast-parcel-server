const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");

dotenv.config();
const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY)

const app = express();

// Middleware
app.use(cors());
app.use(express.json());




const serviceAccount = require("./firebase-admin_key.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});




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
        const usersCollection = client.db('ParcelDB').collection('Users');
        const ridersCollection = client.db('ParcelDB').collection('Riders');
        const parcelCollection = client.db('ParcelDB').collection('Parcels');
        const paymentsCollection = client.db('ParcelDB').collection('Payments');
        const trackingCollection = client.db('ParcelDB').collection('Tracking');

        // custom middlewares

        const verifyFBToken = async (req, res, next) => {
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).send({ message: 'UnAuthorized access' })
            }
            const token = authHeader.split(' ')[1];
            if (!token) {
                return res.status(401).send({ message: 'UnAuthorized access' })
            }
            // verify the token
            try {
                const decoded = await admin.auth().verifyIdToken(token);
                req.decoded = decoded;
                next();
            }
            catch (error) {
                return res.status(403).send({ message: 'Forbidden access' })
            }


            // console.log('header in middleware', authHeader)

        }

        // user all data


        // app.post('/users', async(req, res)=>{
        //     const email = req.body.email;
        //     const userExists = await usersCollection.findOne({email});
        //     if(userExists){
        //         return res.send(200).json({message:'user already exists', inserted:false});
        //     }
        //     const user = req.body;
        //     const result = await usersCollection.insertOne(user);
        //     res.send(result);
        // })


        // get user my search

        app.get("/users/search", async (req, res) => {
            const emailQuery = req.query.email;
            if (!emailQuery) {
                return res.status(400).send({ message: "Missing email query" });
            }

            const regex = new RegExp(emailQuery, "i"); // case-insensitive partial match

            try {
                const users = await usersCollection
                    .find({ email: { $regex: regex } })
                    // .project({ email: 1, createdAt: 1, role: 1 })
                    .limit(10)
                    .toArray();
                res.send(users);
            } catch (error) {
                console.error("Error searching users", error);
                res.status(500).send({ message: "Error searching users" });
            }
        });

        // GET: Get user role by email
        app.get('/users/:email/role', async (req, res) => {
            try {
                const email = req.params.email;

                if (!email) {
                    return res.status(400).send({ message: 'Email is required' });
                }

                const user = await usersCollection.findOne({ email });

                if (!user) {
                    return res.status(404).send({ message: 'User not found' });
                }

                res.send({ role: user.role || 'user' });
            } catch (error) {
                console.error('Error getting user role:', error);
                res.status(500).send({ message: 'Failed to get role' });
            }
        });


        app.post('/users', async (req, res) => {
            try {
                const { email } = req.body;

                // Check if user already exists
                const userExists = await usersCollection.findOne({ email });
                if (userExists) {
                    return res.status(200).json({
                        message: 'User already exists',
                        inserted: false,
                    });
                }

                // Insert new user
                const user = req.body;
                const result = await usersCollection.insertOne(user);

                return res.status(201).json({
                    message: 'User created successfully',
                    inserted: true,
                    result,
                });
            } catch (error) {
                console.error('User insert error:', error);

                // Send only one error response
                if (!res.headersSent) {
                    return res.status(500).json({ message: 'Internal Server Error' });
                }
            }
        });

        // user role modify by id

        app.patch("/users/:id/role", verifyFBToken,  async (req, res) => {
            const { id } = req.params;
            const { role } = req.body;

            if (!["admin", "user"].includes(role)) {
                return res.status(400).send({ message: "Invalid role" });
            }

            try {
                const result = await usersCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { role } }
                );
                res.send({ message: `User role updated to ${role}`, result });
            } catch (error) {
                console.error("Error updating user role", error);
                res.status(500).send({ message: "Failed to update user role" });
            }
        });


        // get all parcels api

        // app.get('/parcels', async (req, res) => {
        //     const parcels = await parcelCollection.find().toArray();
        //     res.send(parcels);
        // })

        // GET: All parcels OR parcels by user(created_by), sorted by latest

        app.get('/parcels', verifyFBToken, async (req, res) => {
            // console.log('headers in parcels', req.headers)
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


        // Riders api 
        app.post('/riders', async (req, res) => {
            const rider = req.body;
            const result = await ridersCollection.insertOne(rider);
            res.send(result);
        })

        // get all pending rider applications
        app.get('/riders/pending', async (req, res) => {
            try {
                const pendingRiders = await ridersCollection.find({ status: "pending" }).toArray();
                res.send(pendingRiders);
            }
            catch (error) {
                console.log('Failed to load pending riders:', error);
                res.status(500).send({ message: "Failed to load pending riders" });
            }
        });

        // riders status
        app.get('/riders/active', async (req, res) => {
            const result = await ridersCollection.find({ status: "active" }).toArray();
            res.send(result);
        })

        app.patch('/riders/:id/status', async (req, res) => {
            const { id } = req.params;
            const { status, email } = req.body;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set:
                {
                    status
                }
            }

            try {
                const result = await ridersCollection.updateOne(
                    query,
                    updateDoc
                );
                // update user role for accepting riders

                if (status === "active") {
                    const userQuery = { email };
                    const userUpdatedDoc = {
                        $set: {
                            role: "rider"
                        }
                    };
                    const roleResult = await usersCollection.updateOne(userQuery, userUpdatedDoc);
                    console.log(roleResult.modifiedCount)
                }
                res.send(result);
            }
            catch (error) {
                res.status(500).send({ message: "Failed to update rider status" });
            }
        });

        // track you parcels
        app.post("/tracking", async (req, res) => {
            const { tracking_id, parcel_id, status, message, updated_by = '' } = req.body;
            const log = {
                tracking_id,
                parcel_id: parcel_id ? new ObjectId(parcel_id) : undefined,
                status,
                message,
                time: new Date(),
                updated_by,
            };
            const result = await trackingCollection.insertOne(log);
            res.send({ success: true, insertedId: result.insertedId })
        });

        app.get('/payments', verifyFBToken, async (req, res) => {
            try {
                const userEmail = req.query.email;
                // console.log('decocded', req.decoded)
                if (req.decoded.email !== userEmail) {
                    return res.status(403).send({ message: 'forbidden access' })
                }

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
