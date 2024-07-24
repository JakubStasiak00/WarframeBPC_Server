const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const vision = require('@google-cloud/vision');


const app = express();
const port = 3000;
const client = new vision.ImageAnnotatorClient({
    keyFilename: './importantKey.json'
});

app.use(cors());

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({storage: storage});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.post('/uploads', upload.single('screenshot'), async (req, res) => {
    try {
        console.log(req.file);
        const fileRef = req.file.destination + req.file.filename;
        console.log(fileRef);
        const [result] = await client.textDetection(fileRef); // line that causes error and stops request from executing any further
        console.log(result)
        const detections = result.textAnnotations;
        console.log(detections);

        res.json({message: 'Screenshot uploaded !', file: req.file, detections: detections });
    } catch (err) {
        res.status(400).send('Error uploading file');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
