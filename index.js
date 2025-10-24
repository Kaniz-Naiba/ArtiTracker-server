require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = 'mongodb+srv://artifacts_tracker:6U0kxyoiJdfhN605@freelance.uly90ar.mongodb.net/?retryWrites=true&w=majority&appName=Freelance';

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

let artifactsCollection, commentsCollection, eventsCollection;

async function run() {
  try {
    // await client.connect(); 
    console.log('✅ Connected to MongoDB');

    const db = client.db('artifacts_db');
    artifactsCollection = db.collection('artifacts');
    commentsCollection = db.collection('comments');
    eventsCollection = db.collection('events');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
}
run().catch(console.dir);

// Middleware to validate
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
}

// ------------------- ROOT -------------------
app.get('/', (req, res) => res.send('Hello from Artifacts Tracker Backend!'));

// ------------------- ARTIFACT ROUTES -------------------
const api = '/api';

app.get(`${api}/artifacts`, async (req, res) => {
  try {
    const { email, featured } = req.query;
    const query = email ? { adderEmail: email } : {};
    if (featured === 'true') {
      const featuredArtifacts = await artifactsCollection.find({}).sort({ likeCount: -1 }).limit(6).toArray();
      return res.json(featuredArtifacts);
    }
    const artifacts = await artifactsCollection.find(query).toArray();
    res.json(artifacts);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch artifacts', error: err.message });
  }
});

// Update artifact
app.put('/api/artifacts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid artifact ID' });

    const updateFields = { ...req.body };

    // Prevent overwriting likeCount and adder info if sent
    delete updateFields.likeCount;
    delete updateFields.likedBy;
    delete updateFields.adderEmail;

    const result = await artifactsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    if (result.modifiedCount === 0) return res.status(404).json({ message: 'Artifact not found or no changes made' });

    const updatedArtifact = await artifactsCollection.findOne({ _id: new ObjectId(id) });
    res.json(updatedArtifact);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update artifact', error: err.message });
  }
});

// Delete artifact
app.delete('/api/artifacts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid artifact ID' });

    const result = await artifactsCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ message: 'Artifact not found' });

    res.json({ message: 'Artifact deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete artifact', error: err.message });
  }
});




app.post(
  `${api}/artifacts`,
  [
    body('name').notEmpty().isString(),
    body('image').isURL(),
    body('type').isIn(['Tools', 'Weapons', 'Inscription', 'Pottery', 'Recording Device', 'Sculpture']),
  ],
  validate,
  async (req, res) => {
    try {
      const newArtifact = {
        ...req.body,
        likeCount: 0,
        likedBy: [],
        location: req.body.location || null,
      };
      const result = await artifactsCollection.insertOne(newArtifact);
      res.status(201).json({ message: 'Artifact created', id: result.insertedId });
    } catch (err) {
      res.status(500).json({ message: 'Failed to create artifact', error: err.message });
    }
  }
);


// ------------------- GET LIKED ARTIFACTS BY USER -------------------
app.get(`${api}/artifacts/liked`, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ message: 'Email query parameter is required' });
    }

    const likedArtifacts = await artifactsCollection
      .find({ likedBy: email })
      .sort({ likeCount: -1 })
      .toArray();

    res.json(likedArtifacts);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch liked artifacts', error: err.message });
  }
});



// PATCH like/unlike
app.patch(`${api}/artifacts/:id/like`, async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid artifact ID' });

    const artifact = await artifactsCollection.findOne({ _id: new ObjectId(id) });
    if (!artifact) return res.status(404).json({ message: 'Artifact not found' });
    if (artifact.likedBy.includes(email)) return res.status(400).json({ message: 'Already liked' });

    await artifactsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $inc: { likeCount: 1 }, $addToSet: { likedBy: email } }
    );

    const updated = await artifactsCollection.findOne({ _id: new ObjectId(id) });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Failed to like artifact', error: err.message });
  }
});

// ------------------- COMMENTS -------------------
app.get(`${api}/comments/:artifactId`, async (req, res) => {
  try {
    const artifactId = req.params.artifactId;
    const comments = await commentsCollection.find({ artifactId }).sort({ createdAt: -1 }).toArray();
    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch comments', error: err.message });
  }
});

app.post('/api/comments', async (req, res) => {
  try {
    const { artifactId, userEmail, userName, text, rating } = req.body;
    if (!artifactId || !userEmail || !text) {
      return res.status(400).json({ message: 'artifactId, userEmail, and text are required' });
    }

    const newComment = {
      artifactId,
      userEmail,
      userName: userName || 'Anonymous',
      text,
      rating: rating || null,
      createdAt: new Date(),
    };

    const result = await commentsCollection.insertOne(newComment);
    res.status(201).json({ message: 'Comment added', id: result.insertedId });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add comment', error: err.message });
  }
});

// ------------------- EVENTS -------------------
app.get(`${api}/events`, async (req, res) => {
  try {
    const events = await eventsCollection.find().sort({ date: 1 }).toArray();
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch events', error: err.message });
  }
});

app.get(`${api}/events/:id`, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid event ID' });

    const event = await eventsCollection.findOne({ _id: new ObjectId(id) });
    if (!event) return res.status(404).json({ message: 'Event not found' });

    res.json(event);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch event', error: err.message });
  }
});

app.post(
  `${api}/events`,
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('date').notEmpty().withMessage('Date is required'),
    body('location').notEmpty().withMessage('Location is required'),
    body('description').optional().isString(),
    body('image').optional().isURL(),
  ],
  validate,
  async (req, res) => {
    try {
      const newEvent = { ...req.body, createdAt: new Date() };
      const result = await eventsCollection.insertOne(newEvent);
      res.status(201).json({ message: 'Event created', id: result.insertedId });
    } catch (err) {
      res.status(500).json({ message: 'Failed to create event', error: err.message });
    }
  }
);

app.delete(`${api}/events/:id`, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid event ID' });

    const result = await eventsCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ message: 'Event not found' });

    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete event', error: err.message });
  }
});

// Get a random artifact
app.get('/api/artifacts/random', async (req, res) => {
  try {
    const count = await artifactsCollection.countDocuments();
    if (count === 0) return res.status(404).json({ message: 'No artifacts found' });

    const randomIndex = Math.floor(Math.random() * count);
    const artifact = await artifactsCollection.find().limit(1).skip(randomIndex).toArray();

    res.json(artifact[0]);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch random artifact', error: err.message });
  }
});

// Then single artifact by ID route
app.get(`${api}/artifacts/:id`, async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid artifact ID' });
    const artifact = await artifactsCollection.findOne({ _id: new ObjectId(id) });
    if (!artifact) return res.status(404).json({ message: 'Artifact not found' });
    res.json(artifact);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch artifact', error: err.message });
  }
});





// ------------------- ERROR HANDLERS -------------------
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Server error', error: err.message });
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
