const { Client } = require('pg');

// Had my local Postgres credentials here.
const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'insert password here',
    database: 'ruggable'
});

// Connect to Postgres
client.connect();

const processNextItems = (orders, rollLength, includeRush) => {
  // If orders are empty, return empty plan.
  if (orders.length === 0) {
    return {
      roll_length: rollLength,
      plan: []
    }
  }
  
  // If include_rush is true, put the rushed orders at the top of the orders array (front of the queue)
  if (includeRush) {
    orders.sort((a, b) => {
      if (a.rush && b.rush) {
        return a.order_date - b.order_date;
      } else if (a.rush) {
        return -1;
      } else {
        return 1;
      }
    })
  }

  // Setting up variables for main logic
  let currentLength = rollLength;
  let needSecondRunner = false;
  let currentRunnerIndex = null;
  let sizeMap = {
    '2.5x7': 7,
    '3x5': 5,
    '5x7': 7
  }
  let plan = [];
  let position = 1;
  const RUNNER_SIZE = '2.5x7';

  for (let i = 0; i < orders.length; i++) {
    let currentOrder = orders[i];
    let size = currentOrder.component_size;
    let length = sizeMap[size];
    
    // If this component is a runner and we already had a runner before on the roll, add them side by side.
    if (size === RUNNER_SIZE && needSecondRunner) {
      const planEntry = {
        id: currentOrder.id,
        position: plan[currentRunnerIndex].position,
        size: size,
        order_date: currentOrder.order_date,
        sku: currentOrder.sku,
        rush: currentOrder.rush
      };
      plan.splice(currentRunnerIndex + 1, 0, planEntry);
      needSecondRunner = false;
      currentRunnerIndex = null;

    // If the length of this current component exceeds whats left of the roll, we cannot add it to the plan.
    } else if (currentLength - length < 0) {
      continue;

    // If this current component can fit, add it to the plan.
    } else {
      currentLength -= length;

      // If this is a runner, then set the appropriate flags so that we can add a runner to this position later.
      if (size === RUNNER_SIZE) {
        needSecondRunner = true;
        currentRunnerIndex = plan.length;       
      }

      // Push into plan and update position.
      const planEntry = {
        id: currentOrder.id,
        position: position,
        size: size,
        order_date: currentOrder.order_date,
        sku: currentOrder.sku,
        rush: currentOrder.rush
      };
      plan.push(planEntry);
      position++;
    }
  }

  return {
    roll_length: rollLength,
    plan: plan
  };
}

// Display list of all Authors.
exports.get_next_items = function (req, res, next) {

  // Destructure roll_length and include_rush values.
  const { roll_length, include_rush } = req.body;
  if (!roll_length) {
    return res.status(400).json({status: 400, message: "Must have valid roll_length."})
  }

  // Query string
  const query = `
  SELECT 
    c.id AS id,
    c.size AS component_size,
    o.order_date AS order_date,
    li.sku AS sku,
    li.rush AS rush
  FROM component c 
  LEFT JOIN line_item li ON c.line_item_id = li.id 
  LEFT JOIN "order" o ON o.id = li.order_id
  WHERE 
    c.status = 'Pending'
  AND
    o.cancelled = false
  AND
    $1 = true OR rush = false
  ORDER BY o.order_date ASC`
  const values = [include_rush]
  
  // Query database
  client.query(query, values, (err, result) => {
    if (err) {
        console.error(err);
        return res.status(500).json({status: 500, message: "A server error has occurred."})
    }
    
    // Create json response.
    const json_response = processNextItems(result.rows, roll_length, include_rush);
    
    // Return json response.
    res.json(json_response);
  });

};