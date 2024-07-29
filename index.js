const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const vision = require('@google-cloud/vision');
const axios = require('axios')
const allTradableItems = require('./TradableItems.js')


const app = express();
const port = 3000;
const client = new vision.ImageAnnotatorClient({
    keyFilename: './importantKey.json' // file with your google cloud service account info
});

app.use(cors());

// Handle image file storage provided by the user
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({storage: storage});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// handle request to upload screenshot and extract text from it
app.post('/uploads', upload.single('screenshot'), async (req, res) => {
    try {
        console.log(req.file);
        const fileRef = req.file.destination + req.file.filename;
        console.log(fileRef);
        const [result] = await client.textDetection(fileRef);
        console.log(result)
        const detections = result.fullTextAnnotation;
        console.log(detections);

        // process data sent from cloud vision api to group detections properly
        let phrases = [];
        if (detections && detections.pages) {
            detections.pages.forEach(page => {
                page.blocks.forEach(block => {
                    block.paragraphs.forEach(paragraph => {
                        let phrase = '';
                        paragraph.words.forEach(word => {
                            const wordText = word.symbols.map(symbol => symbol.text).join('');
                            phrase += wordText + ' ';
                        });
                        phrases.push(phrase.trim());
                    });
                });
            });
        }

        res.json({message: 'Screenshot uploaded !', file: req.file, phrases: phrases });
    } catch (err) {
        res.status(400).send('Error uploading file');
    }
});

app.get('/tradable-items', async (req, res) => {
    console.log(allTradableItems);
    res.json('done');
})

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
