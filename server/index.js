const path = require("path");
require("dotenv").config({path: path.join(__dirname, ".env")});
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/api/rooms", require("./routes/inspo"));
app.use("/api/rooms", require("./routes/rooms"));

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .then(() =>
    app.listen(process.env.PORT, () =>
      console.log(`Server on http://localhost:${process.env.PORT}`)
    )
  )
  .catch((err) => console.error("DB connection error:", err));