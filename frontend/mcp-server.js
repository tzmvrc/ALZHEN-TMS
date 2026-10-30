import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";

const app = express();
const server = new Server({
  name: "alzhen-tms-bridge",
  version: "1.0.0"
}, {
  capabilities: { tools: {} }
});

// Define a tool that ChatGPT can call
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "get_trip_data",
    description: "Fetch active transportation management system schedules",
    inputSchema: { type: "object", properties: {} }
  }]
}));

// Set up Server-Sent Events (SSE) routes for ChatGPT to connect to
let transport;
app.get("/sse", (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  server.connect(transport);
});
app.post("/messages", (req, res) => {
  transport.handleMessage(req, res);
});

app.listen(8000, () => console.log("MCP Bridge running on port 8000"));
