import express from "express";
import RoomImage from "../models/RoomImage.js";
import StyleAnalysis from "../models/StyleAnalysis.js";

import {
  analyzeImages
} from "../services/styleAnalyzer.js";

const router = express.Router();
