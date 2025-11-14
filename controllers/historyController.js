const Summary = require("../models/Summary");

const getSummaries = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;

    const query = {};

    // Add search functionality
    if (search && search.trim() !== "") {
      query.$or = [
        { originalName: { $regex: search, $options: "i" } },
        { summary: { $regex: search, $options: "i" } },
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      select: "-extractedText", // Exclude large extracted text field
    };

    const summaries = await Summary.find(query)
      .sort(options.sort)
      .limit(options.limit)
      .skip((options.page - 1) * options.limit)
      .select(options.select);

    const total = await Summary.countDocuments(query);

    res.json({
      success: true,
      data: summaries,
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        pages: Math.ceil(total / options.limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

const getSummaryById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const summary = await Summary.findById(id);

    if (!summary) {
      return res.status(404).json({ error: "Summary not found" });
    }

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

const deleteSummary = async (req, res, next) => {
  try {
    const { id } = req.params;

    const summary = await Summary.findByIdAndDelete(id);

    if (!summary) {
      return res.status(404).json({ error: "Summary not found" });
    }

    res.json({
      success: true,
      message: "Summary deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getSummaries, getSummaryById, deleteSummary };
