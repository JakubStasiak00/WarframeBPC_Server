const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const vision = require('@google-cloud/vision');
const axios = require('axios')
const allTradableItems = require('./TradableItems.js');
const bodyParser = require('body-parser');
const fs = require('fs');


const app = express();
const port = 3000;
const client = new vision.ImageAnnotatorClient({
    keyFilename: './importantKey.json' // file with your google cloud service account info
});

app.use(cors());
app.use(bodyParser.json());

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
        const fileRef = req.file.destination + req.file.filename;
        const [result] = await client.textDetection(fileRef);
        fs.unlink(fileRef, err => {
            if(err) {
                console.log(err);
            } else {
                console.log('file deleted');
            }
        })

        const detections = result.fullTextAnnotation;

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

app.post('/tradable-items', async (req, res) => {
    try {
        if(!allTradableItems.has(req.body.e.toLowerCase())){
            throw new Error(`Item : ${req.body.e} is not on the list of tradable items !`)
        }
        await new Promise(resolve => setTimeout(resolve, 350));
        const temporaryOrderUrl = `https://api.warframe.market/v2/orders/item/${req.body.e.toLowerCase()}/top`
        console.log(temporaryOrderUrl);
        const itemResponse = await axios.get(temporaryOrderUrl);
        
        await new Promise(resolve => setTimeout(resolve, 350));
        const temporaryInfoUrl = `https://api.warframe.market/v2/items/${req.body.e.toLowerCase()}`
        console.log(temporaryInfoUrl);
        const itemInformation = await axios.get(temporaryInfoUrl);

        res.json({message: 'done', itemResponse: itemResponse.data, itemInformation: itemInformation.data});
    } catch (err) {
        console.log(err.message)
        res.json({message: 'this item doesnt exist', sendNext: true});
    }
})

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
