# Building Firestarter: Our Open Source AI Chatbot Creator

Every website owner knows the struggle. You have great content - documentation, FAQs, product information - but visitors can't always find what they need. They bounce between pages, use clunky search boxes, or worse, leave frustrated.

Traditional chatbot solutions promise to fix this, but they come with enterprise price tags and operate as mysterious black boxes. You feed them your content, pay thousands per month, and hope for the best.

We asked ourselves: What if anyone could turn their website into an AI assistant in just 60 seconds?

This is the story of Firestarter.

## From URL to Chatbot in Under a Minute

Firestarter makes creating AI chatbots surprisingly simple:

1. Enter your website URL
2. Watch as it reads and understands your content
3. Get an instant chatbot that knows everything about your site

But what makes this possible? We combined three powerful technologies:
- **Firecrawl** to read websites (even complex ones built with React or Vue)
- **Upstash** to store and search through your content intelligently
- **AI models** from OpenAI, Anthropic, or Groq to have natural conversations

The result? A chatbot that actually understands your content and gives accurate answers - not generic responses or made-up information.

## How Firestarter Works

When you submit a website URL, here's what happens behind the scenes:

### Step 1: Reading Your Website
Firecrawl visits your site like a very smart reader. It navigates through pages, understands JavaScript-heavy content, and extracts clean, readable text. No more worrying about whether your React app or documentation site will work - Firecrawl handles it all.

### Step 2: Understanding Your Content
Your content gets broken into digestible pieces and stored in Upstash's vector database. Think of it like creating a smart index that understands meaning, not just keywords. When someone asks "How do I get started?", it finds the genuinely helpful sections, not just pages that happen to contain those words.

### Step 3: Natural Conversations
When visitors chat with your bot, Firestarter finds the most relevant information from your site and uses it to generate helpful, accurate responses. The AI is instructed to only use information from your website - if it doesn't know something, it says so honestly rather than making things up.

## What Makes Firestarter Different

### It's Transparent
No black boxes here. You can see exactly which parts of your website the chatbot is using to answer questions. Every response is grounded in your actual content.

### It's Developer-Friendly
Beyond the chat interface, every chatbot gets an OpenAI-compatible API endpoint. This means developers can integrate your website's knowledge anywhere - in their apps, documentation tools, or even code editors.

```python
# Use your website's knowledge programmatically
from openai import OpenAI

client = OpenAI(
    base_url="https://your-firestarter.vercel.app/api/v1",
    api_key="anything"  # No auth required (yet)
)

response = client.chat.completions.create(
    model="your-website-com-12345",
    messages=[{"role": "user", "content": "What is your pricing?"}]
)
```

### It's Affordable
By using modern serverless infrastructure, Firestarter keeps costs low. You only pay for what you use from the underlying services (Firecrawl, Upstash, and your chosen AI provider). No expensive monthly subscriptions.

## Real-World Use Cases

Firestarter shines in several scenarios:

- **Documentation Sites**: Help developers find the right information instantly
- **E-commerce**: Let customers ask about products, shipping, and policies
- **SaaS Platforms**: Reduce support tickets by answering common questions
- **Company Websites**: Turn your About, FAQ, and service pages into a helpful assistant
- **Educational Content**: Make course materials and resources more accessible

## Current Limitations (And Our Roadmap)

Let's be honest about what Firestarter can and can't do today:

### What It Does Well
- Creates accurate, grounded chatbots from any website
- Handles JavaScript-heavy sites seamlessly
- Provides real-time streaming responses
- Offers full API access for developers
- Keeps each chatbot's data completely separate

### What We're Working On
- **Updating content**: Currently, you need to create a new chatbot to refresh content
- **Advanced customization**: Fine-tuning responses and personality
- **Analytics**: Understanding what visitors ask about most
- **Authentication**: Securing chatbots for private use
- **Larger sites**: Better handling of websites with thousands of pages

## Getting Started

You have two options:

### Quick Start (Recommended)
Deploy directly to Vercel with one click:
[Deploy to Vercel](https://vercel.com/new/clone?repository-url=https://github.com/mendableai/firestarter)

You'll need:
- A Firecrawl API key (for reading websites)
- An Upstash account (for storing content)
- An API key from OpenAI, Anthropic, or Groq (for AI responses)

### Run Locally
```bash
git clone https://github.com/mendableai/firestarter
cd firestarter
npm install
npm run dev
```

## Join Us in Building the Future

Firestarter is open source because we believe in building in public. We want developers to:
- Understand exactly how their chatbots work
- Contribute improvements and new features
- Adapt the code for their specific needs
- Help make AI more accessible to everyone

Some ways you can contribute:
- Add support for more AI providers
- Improve how content is processed and stored
- Create better conversation flows
- Add new features like analytics or authentication
- Help with documentation and tutorials

## More Than Just Code

This project represents our belief that powerful AI tools shouldn't be locked behind expensive subscriptions or mysterious algorithms. Every website should be able to offer intelligent, helpful conversations with visitors.

By making Firestarter open source, we're not just sharing code - we're inviting you to join us in democratizing conversational AI.

Ready to turn your website into an AI assistant? [Get started now](https://github.com/mendableai/firestarter).

What will you build with Firestarter?