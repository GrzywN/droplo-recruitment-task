up:
	@docker compose up --build app

preview:
	@MONGO_URI="mongodb://localhost:27017/images" node viewer