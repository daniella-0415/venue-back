
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");



const app = express();

app.use(cors());
app.use(express.json());






//MONGODB SCHEMAS
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log(" MongoDB Connected"))
  .catch((err) => console.log(err));



const userSchema = new mongoose.Schema(
  {
    firebaseUID: String,
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    role: {
      type: String,
      enum: ["Customer", "Venue Manager", "Administrator"],
      default: "Customer",
    },
  },
  { timestamps: true }
);

const eventSchema = new mongoose.Schema(
  {
    venueId: { type: mongoose.Schema.Types.ObjectId, ref: "Venue", required: true },
    title: { type: String, required: true },
    description: String,
    date: Date,
    startTime: String,
    endTime: String,
    ticketSalesClosingDate: Date,
    image: String,
    ticketPrice: Number,
    availableSeats: Number,
  },
  { timestamps: true }
);

const venueSchema = new mongoose.Schema(
  {
    venueName: { type: String, required: true },
    description: { type: String },
    address: { type: String, required: true },
    capacity: { type: Number, required: true },
    numberOfRows: { type: Number, required: true },
    seatsPerRow: { type: Number, required: true },
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const bookingSchema = new mongoose.Schema(
  {
    customerId: mongoose.Schema.Types.ObjectId,
    eventId: mongoose.Schema.Types.ObjectId,
    seats: [String],
    totalPrice: Number,
    paymentStatus: {
      type: String,
      default: "Pending",
    },
  },
  { timestamps: true }
);

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
const User = mongoose.model("User", userSchema);
const Event = mongoose.model("Event", eventSchema);
const Venue = mongoose.model("Venue", venueSchema);
const Booking = mongoose.model("Booking", bookingSchema);
const Ticket = mongoose.model('Ticket', ticketSchema);








//AUTHENTICATION
const authenticate = (req, res, next) => {
  req.user = {
    id: "123456789",
    role: "Administrator",
  };

  next();
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Access Denied",
      });
    }

    next();
  };
};







//   DUMMY HOME API

app.get("/", (req, res) => {
  res.json({
    message: "VenueFlow API Running",
  });
});








//    USERS APIs

app.get("/api/users", authenticate, authorize("Administrator"), async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


app.post("/api/register", async (req, res) => {
  try {
    const { firebaseUID, name, email, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({
        message: "User already exists inside Database",
      });
    }

    const user = await User.create({
      firebaseUID,
      name,
      email,
      role,
    });

    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});


app.post("/api/login", async (req, res) => {
  res.json({
    message: "Login handled by Firebase Authentication",
  });
});

app.get("/api/profile", authenticate, async (req, res) => {
  try {
    const user = await User.findOne({
      firebaseUID: req.user.id,
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

app.put("/api/profile/:id", authenticate, async (req, res) => {
  try {
    const updated = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json(updated);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});








//    EVENT APIs

app.get("/api/events", async (req, res) => {
  try {
    const events = await Event.find();
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/events", async (req, res) => {
  try {
    const events = await Event.find().populate("venueId");
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/events/:id", async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate("venueId");
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post(
  "/api/events",
  authenticate,
  authorize("Venue Manager", "Administrator"),
  async (req, res) => {
    try {
      const event = await Event.create(req.body);
      res.status(201).json(event);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

app.put(
  "/api/events/:id",
  authenticate,
  authorize("Venue Manager", "Administrator"),
  async (req, res) => {
    try {
      const event = await Event.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
      });
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

app.delete(
  "/api/events/:id",
  authenticate,
  authorize("Venue Manager", "Administrator"),
  async (req, res) => {
    try {
      const event = await Event.findByIdAndDelete(req.params.id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.json({ message: "Event deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);








//    BOOKING APIs

app.get("/api/bookings", authenticate, async (req, res) => {
  try {
    const bookings = await Booking.find();

    res.json(bookings);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

app.post(
  "/api/bookings",
  authenticate,
  authorize("Customer"),
  async (req, res) => {
    try {
      const booking = await Booking.create(req.body);

      res.status(201).json(booking);
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  }
);

app.put("/api/bookings/:id", authenticate, async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found",
      });
    }

    res.json(booking);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

app.delete(
  "/api/bookings/:id",
  authenticate,
  authorize("Administrator"),
  async (req, res) => {
    try {
      const booking = await Booking.findByIdAndDelete(req.params.id);

      if (!booking) {
        return res.status(404).json({
          message: "Booking not found",
        });
      }

      res.json({
        message: "Booking deleted",
      });
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  }
);








//TICKETS APIs

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








//VENUES APIs

app.get("/api/venues", async (req, res) => {
  try {
    const venues = await Venue.find();
    res.status(200).json(venues);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/venues/:id", async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ message: "Venue not found" });
    res.status(200).json(venue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(
  "/api/venues",
  authenticate,
  authorize("Venue Manager", "Administrator"),
  async (req, res) => {
    try {
      const newVenue = new Venue(req.body);
      const savedVenue = await newVenue.save();
      res.status(201).json(savedVenue);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

app.put(
  "/api/venues/:id",
  authenticate,
  authorize("Venue Manager", "Administrator"),
  async (req, res) => {
    try {
      const updatedVenue = await Venue.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );
      if (!updatedVenue) return res.status(404).json({ message: "Venue not found" });
      res.status(200).json(updatedVenue);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

app.delete(
  "/api/venues/:id",
  authenticate,
  authorize("Venue Manager", "Administrator"),
  async (req, res) => {
    try {
      const deletedVenue = await Venue.findByIdAndDelete(req.params.id);
      if (!deletedVenue) return res.status(404).json({ message: "Venue not found" });
      res.status(200).json({ message: "Venue deleted successfully" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);








//PAYMENTS APIs

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








const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});