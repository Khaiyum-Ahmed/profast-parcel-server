const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion } = require('mongodb');

dotenv.config();

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

    // get all parcels api
    app.get('/parcels', async(req, res)=>{
        const parcels = await parcelCollection.find().toArray();
        res.send(parcels);
    })

    // GET: All parcels OR parcels by user(created_by), sorted by latest

    app.get('/parcels', async(req, res)=>{
        try{
            const userEmail = req.query.email;
            const query = userEmail? {created_by: userEmail}: {};
            const options = {
                sort:{createdAt: -1}, //Newest first
            };
            const parcels = await parcelCollection.find(query, options).toArray();
            res.send(parcels);
        }
        catch(error){
            console.error('Error fetching parcels:', error);
            res.status(500).send({message: 'Failed to get parcels'})
        }
    })


    // Post: create a new parcel
    app.post('/parcels', async(req, res)=>{
        try{
            const newParcel = req.body;
            const result = await parcelCollection.insertOne(newParcel);
            res.status(201).send(result)
        } catch(error){
            console.error('error inserting parcels:',error);
            res.status(500).send({message: 'Failed to create parcel'})
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
