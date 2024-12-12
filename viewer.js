const express = require('express');
const mongoose = require('mongoose');
const { string, assert } = require('superstruct');

assert(process.env.MONGO_URI, string());

const app = express();
const port = 3000;

mongoose.connect(process.env.MONGO_URI);

const ImageSchema = new mongoose.Schema({
    id: { type: String, required: true },
    index: { type: Number, required: true },
    thumbnail: { type: Buffer, required: true },
});

const ImageModel = mongoose.model('Image', ImageSchema);

app.get('/', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    const images = await ImageModel.find({}, 'id index')
        .skip(skip)
        .limit(limit)
        .sort('index');
    
    const count = await ImageModel.countDocuments();
    const pages = Math.ceil(count / limit);

    res.send(`
        <html>
            <head>
                <style>
                    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
                    .image-container { text-align: center; border: 1px solid #ddd; padding: 10px; }
                </style>
            </head>
            <body>
                <h1>Saved images (${count} total)</h1>
                <div>
                    Page ${page} / ${pages}
                    ${page > 1 ? `<a href="/?page=${page-1}&limit=${limit}">Previous</a>` : ''}
                    ${page < pages ? `<a href="/?page=${page+1}&limit=${limit}">Next</a>` : ''}
                </div>
                <div class="grid">
                    ${images.map(img => `
                        <div class="image-container">
                            <img src="/image/${img.id}" width="100" height="100"/>
                            <div>ID: ${img.id}</div>
                            <div>Index: ${img.index}</div>
                        </div>
                    `).join('')}
                </div>
            </body>
        </html>
    `);
});

app.get('/image/:id', async (req, res) => {
    const image = await ImageModel.findOne({ id: req.params.id });
    if (!image) {
        return res.status(404).send('Not found');
    }
    res.contentType('image/jpeg');
    res.send(image.thumbnail);
});

app.listen(port, () => {
    console.log(`Viewer available at http://localhost:${port}`);
});