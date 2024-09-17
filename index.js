const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const vision = require('@google-cloud/vision');
const axios = require('axios')
const allTradableItems = require('./TradableItems.js');
const bodyParser = require('body-parser');
const fs = require('fs');
const admin = require('firebase-admin');

const app = express();
const port = 3000;
const client = new vision.ImageAnnotatorClient({
    keyFilename: './importantKey.json' // file with your google cloud service account info
});
const timer = ms => new Promise(res => setTimeout(res, ms))
const serviceAccount = require('./firebaseadminkey.json');
const { userInfo } = require('os');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

app.use(cors());
app.use(bodyParser.json());

const saveItemsUpdateTimestamp = () => {
    const currentTime = Date.now()
    const filePath = path.join(__dirname, 'timestamp.txt');

    fs.writeFile(filePath, currentTime.toString(), (err) => {
        if (err) {
            console.error('Error writing to file', err);
        } else {
            console.log(`timestamp ${currentTime} saved to timestamp.txt`);
        }
    });
}

const readItemUpdateTimestamp = () => {
    const filePath = path.join(__dirname, 'timestamp.txt');

    if (!fs.existsSync(filePath)) {
        console.error('Timestamp file not found!');
        return null;
    }
    
    const timestamp = fs.readFileSync(filePath, 'utf8');
    return parseInt(timestamp, 10); // Convert the string to an integer

}

// update list of tradable items every time server starts or once a day
const updateTradableItems = async () => {

    const timestampResult = readItemUpdateTimestamp()
    console.log(timestampResult)
    if(timestampResult && Date.now() - timestampResult <= 86400000) {
        console.log('waiting')
        await timer(86400000 - (timestampResult - Date.now()))
    }
    console.log(Date.now() - timestampResult)

    const response = await axios.get('https://api.warframe.market/v2/items')
    let itemData = response.data.data
    
    itemData.forEach(item => {
        if(allTradableItems.has(item.urlName)) {
            return;
        } else {
            allTradableItems.add(item.urlName)
            console.log(item.urlName)
        }
    })

    let updatedItems = Array.from(allTradableItems);
    let newContent = `let allTradableItems = new Set(${JSON.stringify(updatedItems, null, 4)});\n\nmodule.exports = allTradableItems;`;
    fs.writeFile(path.join(__dirname, 'TradableItems.js'), newContent, { encoding: 'utf8' }, (err) => {
        if (err) {
          console.error('Error writing to file', err);
          return;
        }
        console.log('TradableItems.js has been updated with new items.');
      });

    console.log('job finished')
    saveItemsUpdateTimestamp()
    await timer(86400000) // wait 1 day before running the task again
    updateTradableItems()
}

updateTradableItems()



// Handle image file storage provided by the user
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({storage: storage});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.post('/has-credits', async (req, res) => {

    const uid = req.body.uid

    try {
        console.log(uid)
        const userRef = db.collection('usersInfo').doc(uid)
        console.log(uid)
        const userDoc = await userRef.get()
        console.log(userDoc)

        if(!userDoc.exists) {
            console.log('user doesnt exist')
            return res.status(404).json({ message: 'User not found.' })
        }

        const calculateRemainingCredits = () => {
            return (userDoc.data().currency - 1)
        }

        if (calculateRemainingCredits() <= 0) {
            console.log('not enough currency')
            throw new Error(`User ${uid} has ${userDoc.data().currency} remaining credits`)
        }
        console.log('before update')
        await userRef.update({ currency: calculateRemainingCredits() })
        console.log('after update')
        res.status(200).json({ message: 'Currency required is sufficient', shouldAllowRequest: true})
    } catch (err) {
        res.json({ message: err })
    }
})

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
        let itemName = req.body.e.toLowerCase()
        console.log(itemName)
        switch(itemName){
            case 'axi_06_relic': 
            {
                itemName = 'axi_o6_relic'
                console.log(`item ${itemName} not present`)
            }
            break;
            
            case 'lith_11_relic': 
            {
                itemName = 'lith_l1_relic'
                console.log(`item ${itemName} not present`)
            }
            break;

        }

        if(!allTradableItems.has(itemName)){
            console.log(`item ${itemName} not present`)
            throw new Error(`Item : ${req.body.e} is not on the list of tradable items !`)
        } else {
        await new Promise(resolve => setTimeout(resolve, 350));
        const temporaryOrderUrl = `https://api.warframe.market/v2/orders/item/${itemName}/top`
        const itemResponse = await axios.get(temporaryOrderUrl);
        
        await new Promise(resolve => setTimeout(resolve, 350));
        const temporaryInfoUrl = `https://api.warframe.market/v2/items/${itemName}`
        const itemInformation = await axios.get(temporaryInfoUrl);

        res.json({message: 'done', itemResponse: itemResponse.data, itemInformation: itemInformation.data});
        }
    } catch (err) {
        res.json({message: 'this item doesnt exist', sendNext: true});
    }
})

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
