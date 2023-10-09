import express from "express";
import fetch from "node-fetch";
import "dotenv/config";
import path from "path";
import cors from "cors";

const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PORT = 8888 } = process.env;
console.log("---------------->" + PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET);
const base = "https://api-m.sandbox.paypal.com";
const app = express();

app.use(cors());
app.use(express.json());

/**
 * Generate an OAuth 2.0 access token for authenticating with PayPal REST APIs.
 * @see https://developer.paypal.com/api/rest/authentication/
 */
const generateAccessToken = async () => {
  try {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      throw new Error("MISSING_API_CREDENTIALS");
    }
    const auth = Buffer.from(
      PAYPAL_CLIENT_ID + ":" + PAYPAL_CLIENT_SECRET
    ).toString("base64");
    const response = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      body: "grant_type=client_credentials",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    const data = await response.json();
    if (response.status !== 200) {
      throw new Error(
        `Failed to generate Access Token: ${data.error_description}`
      );
    }

    return data.access_token;
  } catch (error) {
    console.error("Failed to generate Access Token:", error);
    throw error; // Re-throw the error for proper error handling in calling code
  }
};

/**
 * Create an order to start the transaction.
 * @see https://developer.paypal.com/docs/api/orders/v2/#orders_create
 */
const createOrder = async (data) => {
  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders`;
  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: "USD",
          value: data.product.cost,
        },
      },
    ],
  };

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    body: JSON.stringify(payload),
  });

  return handleResponse(response);
};

/**
 * Capture payment for the created order to complete the transaction.
 * @see https://developer.paypal.com/docs/api/orders/v2/#orders_capture
 */
const captureOrder = async (orderID) => {
  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders/${orderID}/capture`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // Clone the response before parsing the JSON data
  const clonedResponse = response.clone();

  // Parse the response body and return the JSON data
  const jsonResponse = await clonedResponse.json();

  return {
    jsonResponse,
    httpStatusCode: response.status,
  };
};

async function handleResponse(response) {
  if (response.status >= 200 && response.status < 300) {
    const jsonResponse = await response.json();
    return {
      jsonResponse,
      httpStatusCode: response.status,
    };
  } else {
    const errorMessage = await response.text();
    throw new Error(
      `Request failed with status ${response.status}: ${errorMessage}`
    );
  }
}

// Handle routes

app.post("/api/orders", async (req, res) => {
  try {
    const { jsonResponse, httpStatusCode } = await createOrder(req.body);
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.log("REQUEST BODY", req.body);
    console.error("Failed to create order:", error);
    res.status(500).json({ error: "Failed to create order." });
  }
});

app.post("/api/orders/:orderID/capture", async (req, res) => {
  try {
    const { orderID } = req.params;
    console.log("-->", orderID);
    const { jsonResponse, httpStatusCode } = await captureOrder(orderID);
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to capture order:", error);
    res.status(500).json({ error: "Failed to capture order." });
  }
});

// Serve your static files (replace with your actual path)
//app.use(express.static(path.resolve("..", "public")));

// Start the server
app.listen(PORT, () => {
  console.log(`Node server listening at http://localhost:${PORT}/`);
});
