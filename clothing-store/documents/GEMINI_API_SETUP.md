# 🚀 Quick Start: Get Your FREE Gemini API Key

## Why Gemini is Perfect for This Project

✅ **100% FREE** - No credit card required  
✅ **15 requests per minute** - Perfect for a chatbot  
✅ **1 million tokens per day** - Extremely generous  
✅ **Function calling** - Smart product search  
✅ **Fast responses** - Optimized for speed  

## Step-by-Step Setup (Takes 2 Minutes!)

### 1️⃣ Get Your FREE API Key

1. **Open this link**: https://aistudio.google.com/app/apikey

2. **Sign in with your Google account**
   - Use any Gmail account
   - No credit card needed!

3. **Click "Create API Key"**
   - Choose "Create API key in new project" (recommended)
   - Or select an existing project

4. **Copy your API key**
   - It will look like: `AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
   - Keep it safe! (but don't worry, you can always create a new one)

### 2️⃣ Add API Key to Your Project

1. **Open** `.env.local` file in your project root

2. **Find this line**:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. **Replace** with your actual key:
   ```env
   GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   ```

4. **Save the file**

### 3️⃣ Start the App

```bash
npm run dev
```

### 4️⃣ Test the Chatbot

1. Open http://localhost:3001
2. Look for the **pink floating button** in bottom-right corner
3. Click it to open the chat
4. Try asking: **"Show me black t-shirts"**

**That's it!** 🎉

## Visual Guide

### Where to Find the Button

```
┌─────────────────────────────────────┐
│                                     │
│    Your Store Website               │
│                                     │
│                                     │
│                              [Chat] │ ← Click this pink button!
│                                  🤖 │
└─────────────────────────────────────┘
```

### What You'll See

```
┌─────────────────────┐
│ StyleBot          ✕ │ ← AI Assistant Header
├─────────────────────┤
│                     │
│ 🤖 Hi! I'm StyleBot│ ← AI greeting
│                     │
│ You: Show me black  │ ← Your message
│      t-shirts       │
│                     │
│ 🤖 Here are some    │ ← AI response
│    black t-shirts:  │
│                     │
│ [Product 1 card]    │ ← Product results
│ [Product 2 card]    │
│                     │
├─────────────────────┤
│ Type message... [>] │ ← Input area
└─────────────────────┘
```

## What Can You Ask?

### ✅ Product Search
- "Show me t-shirts"
- "Do you have jeans?"
- "I'm looking for dresses"

### ✅ Color Search
- "Black t-shirts"
- "Red dress"
- "White shirts"

### ✅ Price Search
- "Jeans under 50,000 MMK"
- "Products under 30,000"
- "Dress between 40,000 and 80,000"

### ✅ Style Search
- "Oversized shirts"
- "Slim fit jeans"
- "Casual wear"

### ✅ Combined Search
- "Black oversized t-shirt under 40,000"
- "Red dress above 50,000 MMK"

## Free Tier Details

### What You Get (FREE):
- ✅ **15 requests per minute**
- ✅ **1,500 requests per day**
- ✅ **1 million tokens per day**

### What This Means:
- 👥 Can handle ~500+ customer conversations per day
- 💬 Each conversation = ~3-5 requests
- 📊 Perfect for small to medium stores
- 💰 **Total Cost: $0**

### Real Example:
If you have 100 customers per day who each ask 3 questions:
- Total requests: 300 per day
- Your limit: 1,500 per day
- **You're only using 20% of your free limit!** 🎉

## Troubleshooting

### ❌ "API key not configured"
**Solution**: Did you add the key to `.env.local`? Restart the server after adding it.

### ❌ "Invalid API key"
**Solution**: 
1. Check you copied the entire key (starts with `AIza...`)
2. No extra spaces before or after
3. Save the file after pasting

### ❌ Chat button not showing
**Solution**: 
1. Clear browser cache
2. Restart dev server: `npm run dev`
3. Refresh the page

### ❌ "Rate limit exceeded"
**Solution**: 
- Wait 1 minute (limits reset automatically)
- You're using too many requests per minute (15 RPM limit)
- Totally normal and limits are generous!

## Monitoring Your Usage

### Check Your Usage:
1. Visit: https://aistudio.google.com/app/apikey
2. Click on your API key
3. See usage statistics

### When Will You Hit Limits?
Probably never for a normal store! The free tier is very generous.

Example:
- Small store (50 customers/day): **Way below limits** ✅
- Medium store (200 customers/day): **Still below limits** ✅
- Large store (1000+ customers/day): **Might need paid tier** 💰

## Comparison: Gemini vs OpenAI

| Feature | Gemini (FREE) | OpenAI (Paid) |
|---------|---------------|---------------|
| **Cost** | 💚 $0/month | 💰 ~$5-50/month |
| **Setup** | 🚀 2 minutes | ⏰ 5 minutes + CC |
| **Quality** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Speed** | ⚡ Fast | ⚡ Fast |
| **Limits** | 15 RPM | Higher (paid) |
| **Best For** | 🏪 Stores | 🏢 Enterprise |

**Verdict**: Gemini is perfect for your clothing store! 🎉

## Security Tips

✅ **DO:**
- Keep API key in `.env.local`
- Add `.env.local` to `.gitignore` (already done)
- Use environment variables

❌ **DON'T:**
- Share API key publicly
- Commit API key to GitHub
- Put API key in client-side code

## Need Help?

### Resources:
- 📚 **Gemini Docs**: https://ai.google.dev/docs
- 🔑 **Get API Key**: https://aistudio.google.com/app/apikey
- 💰 **Pricing Info**: https://ai.google.dev/pricing
- 📊 **Monitor Usage**: https://aistudio.google.com/app/apikey

### Common Questions:

**Q: Is it really free forever?**  
A: Yes! Google offers a free tier that's perfect for small-medium stores.

**Q: What if I exceed the free limits?**  
A: Very unlikely for a normal store. If you do, Gemini has affordable paid tiers.

**Q: Do I need a credit card?**  
A: No! Completely free with just a Google account.

**Q: How long does the API key last?**  
A: Forever! Until you delete it yourself.

**Q: Can I use multiple API keys?**  
A: Yes, you can create multiple keys for different projects.

---

## ✅ Quick Checklist

- [ ] Go to https://aistudio.google.com/app/apikey
- [ ] Sign in with Google account
- [ ] Click "Create API Key"
- [ ] Copy the key (starts with `AIza...`)
- [ ] Open `.env.local` file
- [ ] Paste key: `GEMINI_API_KEY=AIza...`
- [ ] Save file
- [ ] Run: `npm run dev`
- [ ] Open: http://localhost:3001
- [ ] Click pink chat button
- [ ] Ask: "Show me black t-shirts"
- [ ] 🎉 Done!

**Total Time**: 2-3 minutes  
**Total Cost**: $0 (FREE!)  

Enjoy your AI Shopping Assistant! 🚀
