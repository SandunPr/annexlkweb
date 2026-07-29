const express = require('express');
const searchController = require('../controllers/searchController');

const router = express.Router();

// Search is a public endpoint
router.get('/', searchController.search);

module.exports = router;
