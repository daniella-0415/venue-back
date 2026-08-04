const express =  require('express');
const cors = require('cors');
const mongoose = require('mongoose')
require('dotenv').config();

const app = express();
const Port = process.env.Port || 3000;

app.use(cors());
app.use(express.json());

// -------- MongoDB ------------
const connectDB = async 
