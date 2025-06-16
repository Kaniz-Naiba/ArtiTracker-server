require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const PORT = process.env.PORT||3000;


const { body, validationResult } = require('express-validator');

app.use(cors());
app.use(express.json());

const uri = 'mongodb+srv://artifacts_tracker:6U0kxyoiJdfhN605@freelance.uly90ar.mongodb.net/?retryWrites=true&w=majority&appName=Freelance';

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let artifactsCollection;

async function run() {
  try {
    // await client.connect();
    // await client.db('admin').command({ ping: 1 });
    console.log('Successfully connected to MongoDB!');
    artifactsCollection = client.db('artifacts_db').collection('artifacts');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
}
run().catch(console.dir);

// Middleware to validate artifact inputs
function validateArtifact(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

// Root health check route
app.get('/', (req, res) => {
  res.send('Hello from backend!');
});

const apiPrefix = '/api';

app.get(`${apiPrefix}/artifacts`, async (req, res) => {
  try {
    const { email, featured } = req.query;

    let query = {};
    if (email) {
      // My Artifacts
      query.adderEmail = email;
    }

    if (featured === 'true') {
      // Optional: only return top 6 most liked artifacts
      const artifacts = await artifactsCollection
        .find({})
        .sort({ likeCount: -1 }) // sort by likes
        .limit(6)
        .toArray();
      return res.json(artifacts);
    }

    const artifacts = await artifactsCollection.find(query).toArray();
    res.json(artifacts);
  } catch (err) {
    res.status(500).json({ message: 'Failed to get artifacts', error: err.message });
  }
});


// GET liked artifacts by user email
app.get(`${apiPrefix}/artifacts/liked`, async (req, res) => {
  try {
    const userEmail = req.query.email;

    if (!userEmail || typeof userEmail !== 'string' || userEmail.trim() === '') {
      return res.status(400).json({ message: 'Missing or invalid user email' });
    }

    // Query artifacts where likedBy array contains the user's email
    const likedArtifacts = await artifactsCollection
      .find({ likedBy: userEmail.trim() })
      .toArray();

    res.json(likedArtifacts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});
 
// GET artifact by ID
app.get(`${apiPrefix}/artifacts/:id`, async (req, res) => {
  try {
    
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid artifact ID' });
    }
    const artifact = await artifactsCollection.findOne({ _id: new ObjectId(id) });
    if (!artifact) {
      return res.status(404).json({ message: 'Artifact not found' });
    }
    res.json(artifact);
  } catch (err) {
    res.status(500).json({ message: 'Failed to get artifact', error: err.message });
  }
});

// POST create new artifact
app.post(
  `${apiPrefix}/artifacts`,
  [
    body('name').isString().withMessage('Name must be a string').notEmpty().withMessage('Name is required'),
    body('image').isURL().withMessage('Image must be a valid URL').notEmpty().withMessage('Image URL is required'),
    body('type').isIn(['Tools', 'Weapons', 'Inscription', 'Pottery', 'Recording Device','Sculpture']).withMessage('Invalid type'),
    body('historicalContext').optional().isString(),
    body('description').optional().isString(),
    body('createdAt').optional().isString(),
    body('discoveredAt').optional().isString(),
    body('discoveredBy').optional().isString(),
    body('presentLocation').optional().isString(),
     
  ],
  validateArtifact,
  async (req, res) => {
    try {
      const newArtifact = {
        ...req.body,
        likeCount: 0,
        likedBy: []
      };
      const result = await artifactsCollection.insertOne(newArtifact);
      res.status(201).json({ message: 'Artifact created', id: result.insertedId });
    } catch (err) {
      res.status(500).json({ message: 'Failed to create artifact', error: err.message });
    }
  }
);


// PUT update artifact by ID (no updates allowed to likes)
app.put(
  `${apiPrefix}/artifacts/:id`,
  [
    body('name').optional().isString().withMessage('Name must be a string'),
    body('image').optional().isURL().withMessage('Image must be a valid URL'),
    body('type').optional().isIn(['Tools', 'Weapons', 'Inscription', 'Pottery', 'Sculpture','Recording Device']).withMessage('Invalid type'),
    body('historicalContext').optional().isString(),
    body('description').optional().isString(),
    body('createdAt').optional().isString(),
    body('discoveredAt').optional().isString(),
    body('discoveredBy').optional().isString(),
    body('presentLocation').optional().isString(),
  ],
  validateArtifact,
  async (req, res) => {
    try {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid artifact ID' });
      }

      // Prevent updating _id, likeCount, likedBy
      const updateData = { ...req.body };
      delete updateData._id;
      delete updateData.likeCount;
      delete updateData.likedBy;

      const result = await artifactsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );
      if (result.matchedCount === 0) {
        return res.status(404).json({ message: 'Artifact not found' });
      }
      res.json({ message: 'Artifact updated' });
    } catch (err) {
      res.status(500).json({ message: 'Failed to update artifact', error: err.message });
    }
  }
);

// DELETE artifact by ID
app.delete(`${apiPrefix}/artifacts/:id`, async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid artifact ID' });
    }
    const result = await artifactsCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Artifact not found' });
    }
    res.json({ message: 'Artifact deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete artifact', error: err.message });
  }
});

// PATCH like artifact by ID
app.patch(`${apiPrefix}/artifacts/:id/like`, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.body.email;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid artifact ID" });
    }
    if (!userEmail || typeof userEmail !== "string") {
      return res.status(400).json({ message: "User email is required to like artifact" });
    }

    const emailTrimmed = userEmail.trim();

    const artifact = await artifactsCollection.findOne({ _id: new ObjectId(id) });
    if (!artifact) {
      return res.status(404).json({ message: "Artifact not found" });
    }

    if (!Array.isArray(artifact.likedBy)) {
      // Defensive fix if likedBy missing or corrupted
      artifact.likedBy = [];
    }

    if (artifact.likedBy.includes(emailTrimmed)) {
      return res.status(400).json({ message: "User already liked this artifact" });
    }

    const result = await artifactsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $inc: { likeCount: 1 },
        $addToSet: { likedBy: emailTrimmed },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(500).json({ message: "Failed to update artifact likes" });
    }

    const updated = await artifactsCollection.findOne({ _id: new ObjectId(id) });

    res.json({ likeCount: updated.likeCount || 0, likedBy: updated.likedBy || [] });
  } catch (err) {
    console.error("Error in PATCH /artifacts/:id/like:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// PATCH unlike artifact by ID
app.patch(`${apiPrefix}/artifacts/:id/unlike`, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.body.email;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid artifact ID" });
    }
    if (!userEmail || typeof userEmail !== "string") {
      return res.status(400).json({ message: "User email is required to unlike artifact" });
    }

    const emailTrimmed = userEmail.trim();

    const artifact = await artifactsCollection.findOne({ _id: new ObjectId(id) });
    if (!artifact) {
      return res.status(404).json({ message: "Artifact not found" });
    }

    if (!Array.isArray(artifact.likedBy) || !artifact.likedBy.includes(emailTrimmed)) {
      return res.status(400).json({ message: "User has not liked this artifact" });
    }

    const result = await artifactsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $inc: { likeCount: -1 },
        $pull: { likedBy: emailTrimmed },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(500).json({ message: "Failed to update artifact likes" });
    }

    const updated = await artifactsCollection.findOne({ _id: new ObjectId(id) });

    res.json({ likeCount: updated.likeCount || 0, likedBy: updated.likedBy || [] });
  } catch (err) {
    console.error("Error in PATCH /artifacts/:id/unlike:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Server error', error: err.message });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
