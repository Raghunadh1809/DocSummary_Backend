const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const { uploadDocument } = require("../controllers/uploadController");

router.post("/", upload.single("document"), uploadDocument);

module.exports = router;
