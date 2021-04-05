var express = require('express');
var router = express.Router();

// Require our controllers.
var component_controller = require('../controllers/componentController'); 

/* Return next rugs */
router.post('/get-next-items',  component_controller.get_next_items);

module.exports = router;
