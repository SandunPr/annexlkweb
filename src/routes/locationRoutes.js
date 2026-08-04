const express = require('express');
const locationController = require('../controllers/locationController');

const router = express.Router();

router.get('/cities', locationController.getCities);

module.exports = router;
