const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');


const app = express();
const port = 3000;

app.use(cors());

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({storage: storage});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.post('/uploads', upload.single('screenshot'), (req, res) => {
    try {
        res.json({message: 'Screenshot uploaded !', file: req.file });
    } catch (err) {
        res.status(400).send('Error uploading file');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
