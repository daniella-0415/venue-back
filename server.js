
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");



const app = express();

app.use(cors());
app.use(express.json());



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
    venueId: mongoose.Schema.Types.ObjectId,
    title: String,
    description: String,
    date: Date,
    startTime: String,
    endTime: String,
    ticketPrice: Number,
    availableSeats: Number,
    seatLayout: { type: Array, default: [] } 
  },
  { timestamps: true }
);

const bookingSchema = new mongoose.Schema(
  {
    customerId: mongoose.Schema.Types.ObjectId,
    // Add the ref property here:
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event" }, 
    seats: [String],
    totalPrice: Number,
    paymentStatus: {
      type: String,
      default: "Pending",
    },
  },
  { timestamps: true }
);



const User = mongoose.model("User", userSchema);
const Event = mongoose.model("Event", eventSchema);
const Booking = mongoose.model("Booking", bookingSchema);


const authenticate = (req, res, next) => {
  req.user = {
    id: "507f1f77bcf86cd799439011",
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

//    Home Route

app.get("/", (req, res) => {
  res.json({
    message: "VenueFlow API Running",
  });
});


//    USER ROUTES

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




//    EVENT ROUTES

app.get("/api/events", async (req, res) => {
  try {
    const events = await Event.find();
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/events/:id", async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    res.json(event);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
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
      res.status(500).json({
        message: error.message,
      });
    }
  }
);

app.put(
  "/api/events/:id",
  authenticate,
  authorize("Venue Manager", "Administrator"),
  async (req, res) => {
    try {
      const event = await Event.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );

      if (!event) {
        return res.status(404).json({
          message: "Event not found",
        });
      }

      res.json(event);
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
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
        return res.status(404).json({
          message: "Event not found",
        });
      }

      res.json({
        message: "Event deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  }
);

//    BOOKING ROUTES
app.post("/api/bookings", authenticate, async (req, res) => {
  try {
    const { eventId, seats, customerId } = req.body;

    if (!seats || !Array.isArray(seats) || seats.length === 0) {
      return res.status(400).json({ message: "Booking rejected: No seats specified." });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Target event does not exist" });

    const overlappingSeatsExist = await Booking.findOne({
      eventId: eventId,
      seats: { $in: seats } 
    });

    if (overlappingSeatsExist) {
      return res.status(409).json({
        message: "Booking conflict: One or more selected seats are already reserved by another user."
      });
    }

    const finalTotalPrice = seats.length * (event.ticketPrice || 0);

    const confirmedBookingReceipt = await Booking.create({
      customerId: customerId || req.user.id, 
      eventId,
      seats,
      totalPrice: finalTotalPrice,
      paymentStatus: "Confirmed"
    });

    if (event.availableSeats !== undefined) {
      event.availableSeats = Math.max(0, event.availableSeats - seats.length);
      await event.save();
    }

    res.status(201).json(confirmedBookingReceipt);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



app.get("/api/bookings/history", authenticate, async (req, res) => {
  try {
    const personalLogs = await Booking.find({ customerId: req.user.id })
      .populate("eventId", "title date startTime endTime ticketPrice") 
      .sort({ createdAt: -1 }); 

    res.json(personalLogs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


//     Seat endpoints
app.post("/api/seat/layouts", authenticate, authorize("Venue Manager", "Administrator"), async (req, res) => {
  try {
    const { eventId, seatLayout } = req.body;

    if (!eventId || !seatLayout) {
      return res.status(400).json({ message: "Missing eventId or seatLayout in request body." });
    }
    
    const event = await Event.findByIdAndUpdate(
      eventId, 
      { seatLayout }, 
      { new: true }
    );
    
    if (!event) {
      return res.status(404).json({ message: "Target event does not exist" });
    }

    return res.status(201).json({
      message: "Seat layout saved successfully",
      seatLayout: event.seatLayout
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


app.get("/api/seat/layouts/:eventId", authenticate, async (req, res) => {
  try {
    const { eventId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Target event does not exist" });

    res.json({ seatLayout: event.seatLayout || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}); 

app.put("/api/seat/layouts/:eventId", authenticate, authorize("Venue Manager", "Administrator"), async (req, res) => {
  try {
    const { eventId } = req.params;
    const { seatLayout } = req.body;

    if (!seatLayout) {
      return res.status(400).json({ message: "Missing seatLayout in request body." });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Target event does not exist" });

    event.seatLayout = seatLayout;
    await event.save(); 
    
    res.json({ message: "Seat layout updated successfully.", seatLayout: event.seatLayout });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } 
});

app.delete("/api/seat/layouts/:eventId", authenticate, authorize("Venue Manager", "Administrator"), async (req, res) => {
  try {
    const { eventId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Target event does not exist" });

    event.seatLayout = [];
    await event.save(); 
    
    res.json({ message: "Seat layout deleted successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } 
});

//      Sections
app.post("/api/seat/sections", authenticate, authorize("Venue Manager", "Administrator"), async (req, res) => {
  try {
    const { eventId, sections } = req.body;

    if (!eventId || !sections) {
      return res.status(400).json({ message: "Missing eventId or sections in request body." });
    }
    
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Target event does not exist" });

    event.seatSections = sections;
    await event.save();

    res.json({ message: "Seat sections updated successfully.", seatSections: event.seatSections });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/seat/sections/:eventId", authenticate, async (req, res) => {
  try {
    const { eventId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Target event does not exist" });

    res.json({ seatSections: event.seatSections || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/seat/sections/:eventId", authenticate, authorize("Venue Manager", "Administrator"), async (req, res) => { 
  try {
    const { eventId } = req.params;
    const { sections } = req.body;

    if (!sections) {
      return res.status(400).json({ message: "Missing sections in request body." });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Target event does not exist" });

    event.seatSections = sections;
    await event.save();

    res.json({ message: "Seat sections updated successfully.", seatSections: event.seatSections });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/seat/sections/:eventId", authenticate, authorize("Venue Manager", "Administrator"), async (req, res) => {
  try {
    const { eventId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Target event does not exist" });

    event.seatSections = [];
    await event.save();

    res.json({ message: "Seat sections deleted successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rows
app.post("/api/seat/rows", authenticate, authorize("Venue Manager", "Administrator"), async (req, res) => {     
  try {
    const { eventId, rows } = req.body;

    if (!eventId || !rows) {
      return res.status(400).json({ message: "Missing eventId or rows in request body." });
    }
    
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Target event does not exist" });

    event.seatRows = rows;
    await event.save();

    res.json({ message: "Seat rows updated successfully.", seatRows: event.seatRows }); 
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/seat/rows/:eventId", authenticate, async (req, res) => {  
  try {
    const { eventId } = req.params; 

    if (!eventId) {
      return res.status(400).json({ message: "Missing eventId in request parameters." });
    }

    const event = await Event.findById(eventId);
    if (!event) return    
  res.status(404).json({ message: "Target event does not exist" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/seat/rows/:eventId", authenticate, authorize("Venue Manager", "Administrator"), async (req, res) => {
  try {
    const { eventId } = req.params;
    const { rows } = req.body;  


    if (!rows) {  
      return res.status(400).json({ message: "Missing rows in request body." });  
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Target event does not exist" });  
  }catch (error) {  
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/seat/rows/:eventId", authenticate, authorize("Venue Manager", "Administrator"), async (req, res) => {
  try {
    const { eventId } = req.params; 

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Target event does not exist" });  
  }catch (error) {  
    res.status(500).json({ error: error.message });
  }
});

//  Seats
app.post("/api/seat/seats", authenticate, authorize("Venue Manager", "Administrator"), async (req, res) => {  
  try { 
    const { eventId, seats } = req.body;

    if (!eventId || !seats) {  
      return res.status(400).json({ message: "Missing eventId or seats in request body." });  
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Target event does not exist" });
  }catch (error) {  
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/seat/seats/:eventId", authenticate, async (req, res) => {
  try {
    const { eventId } = req.params; 

    const event = await Event.findById(eventId);  
    if (!event) return res.status(404).json({ message: "Target event does not exist" });
  }catch (error) {  
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/seat/seats/:eventId", authenticate, authorize("Venue Manager", "Administrator"), async (req, res) => {
  try {
    const { eventId } = req.params;
    const { seats } = req.body;

    if (!seats) {  
      return res.status(400).json({ message: "Missing seats in request body." });  
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Target event does not exist" });
  }catch (error) {  
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/seat/seats/:eventId", authenticate, authorize("Venue Manager", "Administrator"), async (req, res) => {
  try {
    const { eventId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Target event does not exist" });
  }catch (error) {  
    res.status(500).json({ error: error.message });
  }
});


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
// const mongoose = require('mongoose');

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




const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});