const express = require("express");
const router = express.Router();
const {
  getSummaries,
  getSummaryById,
  deleteSummary,
} = require("../controllers/historyController");

router.get("/", getSummaries);
router.get("/:id", getSummaryById);
router.delete("/:id", deleteSummary);

module.exports = router;
