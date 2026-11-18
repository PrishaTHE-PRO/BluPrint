// One MongoDB connection per process, started on first use and reused.
//
// On Render the process lives for hours, so connecting once at boot is enough.
// On Vercel the same module runs inside a function that is loaded on the first
// request and then kept warm for later ones, so the connection has to be made
// lazily and must survive across requests. Caching the promise does both: the
// first caller connects, everyone else awaits the same promise, and a warm
// instance reuses the open socket pool.

const mongoose = require("mongoose");

let pending = null;

function connectDb() {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose.connection);
  if (!pending) {
    const uri = process.env.MONGODB_URI;
    if (!uri) return Promise.reject(new Error("MONGODB_URI is not set."));
    pending = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 8000 })
      .then((m) => {
        console.log("MongoDB connected");
        return m.connection;
      })
      .catch((err) => {
        // Let the next request try again instead of caching the failure forever.
        pending = null;
        throw err;
      });
  }
  return pending;
}

module.exports = { connectDb };
