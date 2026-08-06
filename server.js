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


//NISSI'S ENPOINTS

const ticketSchema = new mongoose.Schema({
  ticketID: { type: String, required: true },
  user: { type: String, required: true },
  details: { type: Object },
  startDate: { type: String },
  endDate: { type: String },
  price: { type: String },
  seatNo: { type: String },
  tier: { type: String },
  isExpired: { type: Boolean, default: false }
});

const Ticket = mongoose.model('Ticket', ticketSchema);


//TICKETS

app.get('/tickets', async (req, res) => {
  try {
    const tickets = await Ticket.find();
    res.status(200).json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/tickets/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    res.status(200).json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/tickets', async (req, res) => {
  try {
    const newTicket = new Ticket(req.body);
    const savedTicket = await newTicket.save();
    res.status(201).json(savedTicket);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/tickets/:id', async (req, res) => {
  try {
    const updatedTicket = await Ticket.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedTicket) return res.status(404).json({ message: 'Ticket not found' });
    res.status(200).json(updatedTicket);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/tickets/:id', async (req, res) => {
  try {
    const deletedTicket = await Ticket.findByIdAndDelete(req.params.id);
    if (!deletedTicket) return res.status(404).json({ message: 'Ticket not found' });
    res.status(200).json({ message: 'Ticket deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/tickets', async (req, res) => {
  try {
    await Ticket.deleteMany({});
    res.status(200).json({ message: 'All tickets deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//VENUES

const venueSchema = new mongoose.Schema({
  venueName: { type: String, required: true },
  venueID: { type: String, required: true },
  description: { type: String },
  location: { type: String },
  category: { type: String },
  prices: { type: Object },
  isAvailable: { type: Boolean, default: true },
  owner: { type: Object }
});

const Venue = mongoose.model('Venue', venueSchema);




app.get('/venues', async (req, res) => {
  try {
    const venues = await Venue.find();
    res.status(200).json(venues);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/venues/:id', async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ message: 'Venue not found' });
    res.status(200).json(venue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/venues', async (req, res) => {
  try {
    const newVenue = new Venue(req.body);
    const savedVenue = await newVenue.save();
    res.status(201).json(savedVenue);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/venues/:id', async (req, res) => {
  try {
    const updatedVenue = await Venue.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedVenue) return res.status(404).json({ message: 'Venue not found' });
    res.status(200).json(updatedVenue);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/venues/:id', async (req, res) => {
  try {
    const deletedVenue = await Venue.findByIdAndDelete(req.params.id);
    if (!deletedVenue) return res.status(404).json({ message: 'Venue not found' });
    res.status(200).json({ message: 'Venue deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


//PAYMENTS
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    paymentID: { type: String, required: true, unique: true },
    bookingID: { type: String, required: true },
    amount: { type: String, required: true },
    method: { type: String, default: 'PayStack' },
    status: { type: String, default: 'pending' },
    timeStamp: { type: Date, default: Date.now },
    isExpired: { type: Boolean, default: false }
});

const Payment = mongoose.model('Payment', paymentSchema);


app.post('/payments', async (req, res) => {
    try {
        const { email, amount, bookingID } = req.body;

        const response = await fetch('https://api.paystack.co/transaction/initialize', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email,
                amount: Number(amount) * 100,
                metadata: { bookingID }
            }),
        });

        const data = await response.json();
        
        if (!data.status) {
            return res.status(400).json({ error: data.message });
        }

        const newPayment = new Payment({
            paymentID: data.data.reference,
            bookingID,
            amount,
            method: 'PayStack',
            status: 'pending',
            timeStamp: new Date(),
            isExpired: false
        });

        await newPayment.save();

        return res.status(201).json({
            status: 'success',
            authorization_url: data.data.authorization_url,
            reference: data.data.reference,
            payment: newPayment
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error initializing payment' });
    }
});

app.get('/payments', async (req, res) => {
    try {
        const payments = await Payment.find();
        res.status(200).json(payments);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve payments' });
    }
});

app.get('/payments/:id', async (req, res) => {
    try {
        const paymentID = req.params.id;

        const payment = await Payment.findOne({ paymentID });
        
        if (!payment) {
            return res.status(404).json({ error: 'Payment record not found' });
        }

        const paystackVerify = await fetch(`https://api.paystack.co/transaction/verify/${paymentID}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            },
        });

        const verifyData = await paystackVerify.json();

        if (verifyData.status && verifyData.data.status !== payment.status) {
            payment.status = verifyData.data.status;
            await payment.save();
        }

        res.status(200).json(payment);
    } catch (err) {
        res.status(500).json({ error: 'Server error retrieving payment' });
    }
});