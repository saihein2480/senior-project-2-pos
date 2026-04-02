**MyanMyanPay** is **not completely free**.
Like most payment gateways, it usually has **transaction fees**, but **signup and API integration are generally free**.

Here is how the pricing typically works:

---

## 💰 1️⃣ Account / API Access

✔ **Free**

You can:

- Create a merchant account
- Get API keys
- Use the SDK / API
- Test in sandbox

Developers can integrate it quickly with the provided SDK and API. ([docs.myanmyanpay.com][1])

---

## 💰 2️⃣ Transaction Fees

When customers pay, the gateway usually charges:

- **Small percentage of each payment**
- Sometimes **+ fixed MMK fee per transaction**

Example (typical payment gateway model):

| Payment            | Example Fee |
| ------------------ | ----------- |
| 10,000 MMK payment | ~1–3% fee   |
| 50,000 MMK payment | ~1–3% fee   |

The exact fee depends on:

- Payment method (KBZPay, WavePay, etc.)
- Merchant agreement
- Monthly transaction volume

_(You normally get the exact rate after merchant approval.)_

---

## 💰 3️⃣ Settlement

Money goes to your bank account.

Typical flow:

- Customer pays → wallet
- Gateway processes payment
- Money sent to merchant bank

Settlements are usually **daily**, and withdrawals typically reach your bank within about **2 business days**. ([myanmyanpay.com][2])

---

## 👍 Summary

| Feature                 | Cost            |
| ----------------------- | --------------- |
| Create account          | Free            |
| API / SDK               | Free            |
| Sandbox testing         | Free            |
| Real payment processing | Transaction fee |

---

✅ **Good news for your POS project:**
You **don’t pay anything until customers start paying**.

---

💡 If you want, I can also explain **something very important developers in Myanmar often miss**:

**Why many developers cannot activate MyanMyanPay even after getting API keys** (there is a verification step with bank + KYC).

[1]: https://docs.myanmyanpay.com/sdk-browser/?utm_source=chatgpt.com "Browser SDK - Myan Myan Pay"
[2]: https://myanmyanpay.com/?utm_source=chatgpt.com "MyanMyanPay - Payment Infrastructure for Myanmar"
