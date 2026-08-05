
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

const venueSchema = new mongoose.Schema(
  {
    managerId: mongoose.Schema.Types.ObjectId,
    name: String,
    description: String,
    address: String,
    city: String,
    capacity: Number,
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

const paymentSchema = new mongoose.Schema(
  {
    bookingId: mongoose.Schema.Types.ObjectId,
    amount: Number,
    reference: String,
    status: {
      type: String,
      default: "Pending",
    },
  },
  { timestamps: true }
);



const User = mongoose.model("User", userSchema);
const Venue = mongoose.model("Venue", venueSchema);
const Event = mongoose.model("Event", eventSchema);
const Booking = mongoose.model("Booking", bookingSchema);
const Payment = mongoose.model("Payment", paymentSchema);



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

// Delete Booking
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

//    SERVER

const PORT = process.env.PORT || 5174;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});