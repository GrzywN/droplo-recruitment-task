const ImageProcessor = require('./image-processor');

async function main() {
    try {
        const processor = new ImageProcessor();
        await processor.start();
        
        console.log('Processing completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Processing failed:', error);
        process.exit(1);
    }
}

main();
