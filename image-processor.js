const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const { default: axios } = require('axios');
const sharp = require('sharp');
const mongoose = require('mongoose');
const { string, integer, assert } = require('superstruct');

assert(process.env.MONGO_URI, string());
assert(parseFloat(process.env.DEFAULT_BATCH_SIZE), integer());

mongoose.connect(process.env.MONGO_URI);

const ImageSchema = new mongoose.Schema({
    id: { type: String, required: true },
    index: { type: Number, required: true },
    thumbnail: { type: Buffer, required: true },
});

const ImageModel = mongoose.model('Image', ImageSchema);

class ImageProcessor {
    constructor() {
        this.logger = console;
        this.processedCount = 0;
    }

    async start() {
        const batchSize = parseInt(process.env.DEFAULT_BATCH_SIZE, 10);
        const filePath = path.join(__dirname, `data/data.csv`);
        
        this.logger.info(`Batch size: ${batchSize}`);
        
        let currentBatch = [];
        
        const parser = fs
            .createReadStream(filePath)
            .pipe(parse({
                columns: true,
                skip_empty_lines: true,
                trim: true
            }));

        for await (const record of parser) {
            currentBatch.push({
                index: parseInt(record.index, 10),
                id: record.id,
                url: record.url,
                thumbnail: null
            });

            if (currentBatch.length >= batchSize) {
                await this.processBatch(currentBatch);
                currentBatch = [];
            }
        }

        // Process any remaining records
        if (currentBatch.length > 0) {
            await this.processBatch(currentBatch);
        }

        this.logger.info(`Processing completed. Total processed: ${this.processedCount}`);
    }

    async processBatch(batch) {
        try {
            const images = await this.processChunk(batch);
            await ImageModel.insertMany(images.filter(img => img !== null), { ordered: false });

            this.processedCount += images.filter(img => img !== null).length;
            this.logger.info(`Processed batch size: ${images.length}`);
            this.logger.info(
                `Last processed index: ${batch[batch.length - 1].index}, ` +
                `Last processed ID: ${batch[batch.length - 1].id}`
            );

            if (global.gc) global.gc();
        } catch (error) {
            this.logger.error(`Error processing batch: ${error.message}`);
        }
    }

    async processChunk(rawEntities) {
        const tasks = rawEntities.map(rawEntity => this.createThumbnail(rawEntity));
        return Promise.all(tasks);
    }

    async createThumbnail(rawEntity) {
        try {
            const response = await axios.get(rawEntity.url, { responseType: 'arraybuffer' });
            const buffer = await sharp(response.data)
                .resize(100, 100)
                .toBuffer();

            rawEntity.thumbnail = buffer;
            delete rawEntity.url;
            return rawEntity;
        } catch (error) {
            this.logger.error(`Error creating thumbnail for ID ${rawEntity.id}: ${error.message}`);
            return null;
        }
    }
}

module.exports = ImageProcessor;