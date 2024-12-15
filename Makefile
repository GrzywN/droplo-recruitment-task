up:
	@docker compose up --build app

preview:
	@MONGO_URI="mongodb://localhost:27017/images" node viewer

format:
	@npm run format

build:
	@npm install