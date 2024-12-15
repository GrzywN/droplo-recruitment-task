# Image Processing Service (Droplo - Mid/Senior Node.js Developer - Recruitment task)

Service for processing images from CSV files. It reads image URLs from a CSV file, downloads them, creates thumbnails, and stores them in MongoDB.

## Features

- CSV file streaming for memory-efficient processing
- Image thumbnail generation with Sharp
- MongoDB integration for storing processed images
- Batch processing with configurable batch size
- Retry mechanism for failed downloads
- Graceful shutdown handling
- Docker support for easy deployment

## Prerequisites

- Node.js (LTS version)
- Docker and Docker Compose
- Make (optional, for using Makefile commands)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/GrzywN/droplo-recruitment-task.git
cd droplo-recruitment-task
```

2. Install dependencies:
```bash
make build
```

## Configuration

The application uses environment variables for configuration:

MONGO_URI - MongoDB connection string
DEFAULT_BATCH_SIZE - Number of images to process in one batch

## Development

### Running the Application using Docker (recommended)

Run the application with Docker Compose:

```bash
make up
```

### Using Preview Server

To view processed images, run the preview server:

```bash
make preview
```

### Code Formatting

To format the code using Prettier:

```bash
make format
```

### Data Format

The application expects a CSV file (data/data.csv) with the following structure:

```csv
index,id,url
1,image1,https://example.com/image1.jpg
2,image2,https://example.com/image2.jpg
```

### Additional Information

- Images larger than 120MB are automatically rejected
- Failed downloads are retried up to 3 times
- The application handles graceful shutdown on SIGTERM and SIGINT signals

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Author

Karol Binkowski