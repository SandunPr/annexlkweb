const express = require('express');
const renterController = require('../controllers/renterController');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

router.use(authenticate);

router.get('/', renterController.getFavourites);
router.post('/:listingId', renterController.addFavourite);
router.delete('/:listingId', renterController.removeFavourite);

module.exports = router;
