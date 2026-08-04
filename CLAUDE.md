# Project Overview

This project is a backend service for AI-powered travel assistant bots.

The backend is designed to be channel-agnostic. Initially, it will
support Telegram, but the architecture should allow additional channels
(such as WhatsApp, a web chat, Facebook Messenger, etc.) to be added
without changing the core business logic.

The backend is responsible for:

-   Receiving incoming customer messages.
-   Maintaining conversation history.
-   Executing the AI agent.
-   Providing the AI agent with access to external tools (MCP servers
    and APIs).
-   Returning the generated response to the client application.

## Chat Endpoint

Initially, the application will expose a single endpoint:

`POST /chat`

The endpoint should receive:

-   `channel` -- the communication platform (e.g. `telegram`).
-   `travelAgentId` -- identifies the travel agency or travel consultant
    using the system.
-   `customerId` -- uniquely identifies the customer within that
    channel.
-   `message` -- the customer's latest message.

These identifiers are required to locate the existing conversation
history before executing the AI agent.

The AI agent must always receive the previous conversation so it can
answer in context instead of treating every message as a new
conversation.

## Conversation Storage

Conversation history will be stored in Supabase (PostgreSQL).

Initially, the backend will persist all chat messages so that each
request can reconstruct the conversation before invoking the AI agent.

A conversation is conceptually identified by:

`(channel, travelAgentId, customerId)`

This allows the same backend to support multiple communication channels
while keeping conversations isolated.

## AI Agent

The application will initially use a single Travel Agent.

The Travel Agent is responsible for:

-   Answering travel-related questions.
-   Searching for flights.
-   Searching for hotels.
-   Using external MCP servers and APIs when required.
-   Knowing the previous conversation history.
-   Escalating the conversation to a human travel agent when the
    customer is ready to continue with a real person or purchase a
    service.

The goal is to keep the first version simple: one backend, one AI agent,
one chat endpoint, and persistent conversation history.


**Technologies**
- Typescript
- Express
- Open AI Agents SDK

**Testing**
- For API endpoint testing we are using "REST Client" VS Code extension and the files with ".http" extension, located in /api-tests folder
of this project. THe first part in the name is a method, and then the endpoint itself. THe name is dash separated