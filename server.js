require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());

  //  CONFIGURATION

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error(" MONGO_URI is missing from .env");
  process.exit(1);
}

  //  MONGODB

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((error) => {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  });

  //  HELPER FUNCTIONS

function generateBookingReference() {
  return `VF-${Date.now()}-${crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;
}

function generateSeats(rows, seatsPerRow) {
  const seats = [];

  for (let row = 0; row < rows; row++) {
    const rowLetter = String.fromCharCode(65 + row);

    for (let number = 1; number <= seatsPerRow; number++) {
      seats.push(`${rowLetter}${number}`);
    }
  }

  return seats;
}

function isValidDate(value) {
  return !Number.isNaN(new Date(value).getTime());
}

  //  USER MODEL

const userSchema = new mongoose.Schema(
  {
    firebaseUID: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    role: {
      type: String,
      enum: [
        "Customer",
        "Venue Manager",
        "Administrator",
      ],
      default: "Customer",
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

  //  VENUE MODEL

const venueSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    city: {
      type: String,
      required: true,
      trim: true,
    },

    capacity: {
      type: Number,
      required: true,
      min: 1,
    },

    rows: {
      type: Number,
      required: true,
      min: 1,
      max: 26,
    },

    seatsPerRow: {
      type: Number,
      required: true,
      min: 1,
    },

    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);


  // rows × seatsPerRow


venueSchema.pre("validate", function () {
  if (this.rows && this.seatsPerRow) {
    this.capacity = this.rows * this.seatsPerRow;
  }
});

const Venue = mongoose.model("Venue", venueSchema);

  //  EVENT MODEL

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    venueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Venue",
      required: true,
    },

    date: {
      type: Date,
      required: true,
    },

    startTime: {
      type: String,
      required: true,
      trim: true,
    },

    salesClosingDate: {
      type: Date,
      required: true,
    },

    image: {
      type: String,
      default: "",
      trim: true,
    },

    ticketPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Event = mongoose.model("Event", eventSchema);

  //  BOOKING MODEL

const bookingSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    venueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Venue",
      required: true,
    },

    seats: {
      type: [String],
      required: true,

      validate: {
        validator: (value) => value.length > 0,
        message: "At least one seat must be selected",
      },
    },

    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: [
        "Pending",
        "Confirmed",
        "Cancelled",
      ],
      default: "Confirmed",
    },

    bookingReference: {
      type: String,
      required: true,
      unique: true,
    },
  },
  {
    timestamps: true,
  }
);



bookingSchema.index(
  {
    eventId: 1,
    seats: 1,
  },
  {
    unique: true,
  }
);

const Booking = mongoose.model(
  "Booking",
  bookingSchema
);

  //  PAYMENT MODEL

const paymentSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "Pending",
        "Successful",
        "Failed",
      ],
      default: "Pending",
    },
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model(
  "Payment",
  paymentSchema
);

  //  TEMPORARY AUTHENTICATION


async function authenticateUser(req, res, next) {
  try {
    const userId = req.headers["x-user-id"];
    const userRole = req.headers["x-user-role"];

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        message: "Invalid user ID",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({
        message: "User not found",
      });
    }

  

    req.user = user;

    if (userRole && userRole !== user.role) {
      return res.status(403).json({
        message: "Role does not match this user",
      });
    }

    next();
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Authentication error",
      error: error.message,
    });
  }
}


  //  ROLE AUTHORIZATION

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You do not have permission to perform this action",
      });
    }

    next();
  };
}


  //  BASIC TEST ROUTE

app.get("/", (req, res) => {
  res.json({
    message: "VenueFlow API Running",
  });
});


  //  USER REGISTRATION



app.post("/api/users/register", async (req, res) => {
  try {
    const {
      firebaseUID,
      name,
      email,
      role,
    } = req.body;

    if (!firebaseUID || !name || !email) {
      return res.status(400).json({
        message:
          "firebaseUID, name and email are required",
      });
    }

    const allowedRoles = [
      "Customer",
      "Venue Manager",
      "Administrator",
    ];

    const selectedRole = role || "Customer";

    if (!allowedRoles.includes(selectedRole)) {
      return res.status(400).json({
        message: "Invalid role",
      });
    }

    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { firebaseUID },
      ],
    });

    if (existingUser) {
      return res.status(409).json({
        message: "User already exists",
        user: existingUser,
      });
    }

    const user = await User.create({
      firebaseUID,
      name,
      email: email.toLowerCase(),
      role: selectedRole,
    });

    res.status(201).json(user);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to register user",
      error: error.message,
    });
  }
});



//  USER LOGIN

app.post("/api/login", async (req, res) => {
  try {
    const { idToken, email } = req.body;

    if (!idToken || !email) {
      return res.status(400).json({
        message: "idToken and email are required",
      });
    }

    // Find the user in MongoDB using their email
    const user = await User.findOne({
      email: email.toLowerCase(),
    }).select("-__v");

    if (!user) {
      return res.status(404).json({
        message:
          "User account not found. Please register first.",
      });
    }

    res.json({
      message: "Login successful",
      user: {
        id: user._id,
        firebaseUID: user.firebaseUID,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Failed to log in",
      error: error.message,
    });
  }
});
  //  GET ALL USERS

app.get(
  "/api/users",
  authenticateUser,
  authorizeRoles("Administrator"),
  async (req, res) => {
    try {
      const users = await User.find()
        .select("-__v")
        .sort({ createdAt: -1 });

      res.json(users);
    } catch (error) {
      res.status(500).json({
        message: "Failed to get users",
        error: error.message,
      });
    }
  }
);


  //  GET CURRENT USER PROFILE

app.get(
  "/api/users/profile",
  authenticateUser,
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id)
        .select("-__v");

      res.json(user);
    } catch (error) {
      res.status(500).json({
        message: "Failed to get profile",
        error: error.message,
      });
    }
  }
);


  //  UPDATE CURRENT USER PROFILE

app.put(
  "/api/users/profile",
  authenticateUser,
  async (req, res) => {
    try {
      const {
        name,
        email,
      } = req.body;

      const updates = {};

      if (name !== undefined) {
        if (!name.trim()) {
          return res.status(400).json({
            message: "Name cannot be empty",
          });
        }

        updates.name = name.trim();
      }

      if (email !== undefined) {
        if (!email.trim()) {
          return res.status(400).json({
            message: "Email cannot be empty",
          });
        }

        updates.email = email
          .trim()
          .toLowerCase();
      }

    

      const updatedUser =
        await User.findByIdAndUpdate(
          req.user._id,
          updates,
          {
            new: true,
            runValidators: true,
          }
        ).select("-__v");

      res.json(updatedUser);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          message: "Email is already in use",
        });
      }

      res.status(500).json({
        message: "Failed to update profile",
        error: error.message,
      });
    }
  }
);


  //  ADMIN — UPDATE USER ROLE

app.put(
  "/api/users/:id/role",
  authenticateUser,
  authorizeRoles("Administrator"),
  async (req, res) => {
    try {
      const {
        role,
      } = req.body;

      const allowedRoles = [
        "Customer",
        "Venue Manager",
        "Administrator",
      ];

      if (!allowedRoles.includes(role)) {
        return res.status(400).json({
          message: "Invalid role",
        });
      }

      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          message: "Invalid user ID",
        });
      }

      const user =
        await User.findByIdAndUpdate(
          req.params.id,
          { role },
          {
            new: true,
            runValidators: true,
          }
        ).select("-__v");

      if (!user) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      res.json({
        message: "User role updated",
        user,
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to update user role",
        error: error.message,
      });
    }
  }
);


  //  VENUE — CREATE

app.post(
  "/api/venues",
  authenticateUser,
  authorizeRoles(
    "Venue Manager",
    "Administrator"
  ),
  async (req, res) => {
    try {
      const {
        name,
        description,
        address,
        city,
        rows,
        seatsPerRow,
      } = req.body;

      if (
        !name ||
        !address ||
        !city ||
        rows === undefined ||
        seatsPerRow === undefined
      ) {
        return res.status(400).json({
          message:
            "name, address, city, rows and seatsPerRow are required",
        });
      }

      const parsedRows = Number(rows);
      const parsedSeatsPerRow =
        Number(seatsPerRow);

      if (
        !Number.isInteger(parsedRows) ||
        parsedRows < 1 ||
        parsedRows > 26
      ) {
        return res.status(400).json({
          message:
            "Rows must be a whole number between 1 and 26",
        });
      }

      if (
        !Number.isInteger(parsedSeatsPerRow) ||
        parsedSeatsPerRow < 1
      ) {
        return res.status(400).json({
          message:
            "Seats per row must be a positive whole number",
        });
      }

      const venue = await Venue.create({
        name,
        description,
        address,
        city,
        rows: parsedRows,
        seatsPerRow: parsedSeatsPerRow,
        capacity:
          parsedRows * parsedSeatsPerRow,
        managerId:
          req.user.role === "Venue Manager"
            ? req.user._id
            : null,
      });

      res.status(201).json(venue);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to create venue",
        error: error.message,
      });
    }
  }
);


  //  VENUE  GET ALL

app.get(
  "/api/venues",
  async (req, res) => {
    try {
      const venues = await Venue.find()
        .populate(
          "managerId",
          "name email role"
        )
        .sort({ createdAt: -1 });

      res.json(venues);
    } catch (error) {
      res.status(500).json({
        message: "Failed to get venues",
        error: error.message,
      });
    }
  }
);


  //  VENUE  GET ONE

app.get(
  "/api/venues/:id",
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message: "Invalid venue ID",
        });
      }

      const venue = await Venue.findById(
        req.params.id
      ).populate(
        "managerId",
        "name email role"
      );

      if (!venue) {
        return res.status(404).json({
          message: "Venue not found",
        });
      }

      res.json(venue);
    } catch (error) {
      res.status(500).json({
        message: "Failed to get venue",
        error: error.message,
      });
    }
  }
);


  //  VENUE  UPDATE

app.put(
  "/api/venues/:id",
  authenticateUser,
  authorizeRoles(
    "Venue Manager",
    "Administrator"
  ),
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message: "Invalid venue ID",
        });
      }

      const venue =
        await Venue.findById(
          req.params.id
        );

      if (!venue) {
        return res.status(404).json({
          message: "Venue not found",
        });
      }

     

      if (
        req.user.role === "Venue Manager" &&
        venue.managerId &&
        venue.managerId.toString() !==
          req.user._id.toString()
      ) {
        return res.status(403).json({
          message:
            "You can only update your own venues",
        });
      }

      const {
        name,
        description,
        address,
        city,
        rows,
        seatsPerRow,
      } = req.body;

      if (name !== undefined) {
        venue.name = name;
      }

      if (description !== undefined) {
        venue.description = description;
      }

      if (address !== undefined) {
        venue.address = address;
      }

      if (city !== undefined) {
        venue.city = city;
      }

      if (rows !== undefined) {
        const parsedRows = Number(rows);

        if (
          !Number.isInteger(parsedRows) ||
          parsedRows < 1 ||
          parsedRows > 26
        ) {
          return res.status(400).json({
            message:
              "Rows must be a whole number between 1 and 26",
          });
        }

        venue.rows = parsedRows;
      }

      if (seatsPerRow !== undefined) {
        const parsedSeats =
          Number(seatsPerRow);

        if (
          !Number.isInteger(parsedSeats) ||
          parsedSeats < 1
        ) {
          return res.status(400).json({
            message:
              "Seats per row must be a positive whole number",
          });
        }

        venue.seatsPerRow = parsedSeats;
      }

      venue.capacity =
        venue.rows * venue.seatsPerRow;

      await venue.save();

      res.json(venue);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to update venue",
        error: error.message,
      });
    }
  }
);


  //  VENUE — DELETE

app.delete(
  "/api/venues/:id",
  authenticateUser,
  authorizeRoles(
    "Venue Manager",
    "Administrator"
  ),
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message: "Invalid venue ID",
        });
      }

      const venue =
        await Venue.findById(
          req.params.id
        );

      if (!venue) {
        return res.status(404).json({
          message: "Venue not found",
        });
      }

   

      if (
        req.user.role === "Venue Manager" &&
        venue.managerId &&
        venue.managerId.toString() !==
          req.user._id.toString()
      ) {
        return res.status(403).json({
          message:
            "You can only delete your own venues",
        });
      }

     

      const eventUsingVenue =
        await Event.findOne({
          venueId: venue._id,
        });

      if (eventUsingVenue) {
        return res.status(400).json({
          message:
            "Cannot delete venue because it has events associated with it",
        });
      }

      await Venue.findByIdAndDelete(
        req.params.id
      );

      res.json({
        message: "Venue deleted successfully",
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to delete venue",
        error: error.message,
      });
    }
  }
);

  //  EVENT  CREATE

app.post(
  "/api/events",
  authenticateUser,
  authorizeRoles(
    "Venue Manager",
    "Administrator"
  ),
  async (req, res) => {
    try {
      const {
        title,
        description,
        venueId,
        date,
        startTime,
        salesClosingDate,
        image,
        ticketPrice,
      } = req.body;

        //  REQUIRED FIELDS

      if (
        !title ||
        !venueId ||
        !date ||
        !startTime ||
        !salesClosingDate ||
        ticketPrice === undefined
      ) {
        return res.status(400).json({
          message:
            "title, venueId, date, startTime, salesClosingDate and ticketPrice are required",
        });
      }

        //  VALIDATE VENUE ID

      if (!mongoose.Types.ObjectId.isValid(venueId)) {
        return res.status(400).json({
          message: "Invalid venue ID",
        });
      }

      const venue = await Venue.findById(venueId);

      if (!venue) {
        return res.status(404).json({
          message: "Venue not found",
        });
      }

        //  VENUE MANAGER OWNERSHIP

      if (
        req.user.role === "Venue Manager" &&
        venue.managerId &&
        venue.managerId.toString() !==
          req.user._id.toString()
      ) {
        return res.status(403).json({
          message:
            "You can only create events for your own venues",
        });
      }

        //  VALIDATE DATES

      if (!isValidDate(date)) {
        return res.status(400).json({
          message: "Invalid event date",
        });
      }

      if (!isValidDate(salesClosingDate)) {
        return res.status(400).json({
          message: "Invalid sales closing date",
        });
      }

      const eventDate = new Date(date);
      const closingDate = new Date(
        salesClosingDate
      );

      if (closingDate >= eventDate) {
        return res.status(400).json({
          message:
            "Ticket sales closing date must be before the event date",
        });
      }

        //  VALIDATE PRICE

      const parsedPrice = Number(ticketPrice);

      if (
        Number.isNaN(parsedPrice) ||
        parsedPrice < 0
      ) {
        return res.status(400).json({
          message:
            "Ticket price must be a valid positive number",
        });
      }

        //  CREATE EVENT

      const event = await Event.create({
        title: title.trim(),
        description: description || "",
        venueId,
        date: eventDate,
        startTime: startTime.trim(),
        salesClosingDate: closingDate,
        image: image || "",
        ticketPrice: parsedPrice,
        createdBy: req.user._id,
      });

      const populatedEvent =
        await Event.findById(event._id)
          .populate(
            "venueId",
            "name address city capacity rows seatsPerRow"
          )
          .populate(
            "createdBy",
            "name email role"
          );

      res.status(201).json(
        populatedEvent
      );
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to create event",
        error: error.message,
      });
    }
  }
);


  //  EVENT — GET ALL

app.get(
  "/api/events",
  async (req, res) => {
    try {
      const events = await Event.find()
        .populate(
          "venueId",
          "name description address city capacity rows seatsPerRow"
        )
        .populate(
          "createdBy",
          "name email role"
        )
        .sort({
          date: 1,
        });

      res.json(events);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to get events",
        error: error.message,
      });
    }
  }
);


  //  EVENT — GET ONE

app.get(
  "/api/events/:id",
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message: "Invalid event ID",
        });
      }

      const event =
        await Event.findById(
          req.params.id
        )
          .populate(
            "venueId",
            "name description address city capacity rows seatsPerRow"
          )
          .populate(
            "createdBy",
            "name email role"
          );

      if (!event) {
        return res.status(404).json({
          message: "Event not found",
        });
      }

      res.json(event);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to get event",
        error: error.message,
      });
    }
  }
);


  //  EVENT  UPDATE

app.put(
  "/api/events/:id",
  authenticateUser,
  authorizeRoles(
    "Venue Manager",
    "Administrator"
  ),
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message: "Invalid event ID",
        });
      }

      const event =
        await Event.findById(
          req.params.id
        );

      if (!event) {
        return res.status(404).json({
          message: "Event not found",
        });
      }

        //  FIND THE EVENT VENUE

      const venue =
        await Venue.findById(
          event.venueId
        );

      if (!venue) {
        return res.status(404).json({
          message:
            "The venue associated with this event no longer exists",
        });
      }

        //  VENUE MANAGER OWNERSHIP

      if (
        req.user.role === "Venue Manager" &&
        venue.managerId &&
        venue.managerId.toString() !==
          req.user._id.toString()
      ) {
        return res.status(403).json({
          message:
            "You can only update events belonging to your venues",
        });
      }

      const {
        title,
        description,
        venueId,
        date,
        startTime,
        salesClosingDate,
        image,
        ticketPrice,
      } = req.body;

        //  UPDATE VENUE

      if (venueId !== undefined) {
        if (
          !mongoose.Types.ObjectId.isValid(
            venueId
          )
        ) {
          return res.status(400).json({
            message: "Invalid new venue ID",
          });
        }

        const newVenue =
          await Venue.findById(
            venueId
          );

        if (!newVenue) {
          return res.status(404).json({
            message: "New venue not found",
          });
        }

        if (
          req.user.role === "Venue Manager" &&
          newVenue.managerId &&
          newVenue.managerId.toString() !==
            req.user._id.toString()
        ) {
          return res.status(403).json({
            message:
              "You can only move events to your own venues",
          });
        }

        event.venueId = venueId;
      }

        //  UPDATE BASIC INFORMATION

      if (title !== undefined) {
        if (!title.trim()) {
          return res.status(400).json({
            message: "Event title cannot be empty",
          });
        }

        event.title = title.trim();
      }

      if (description !== undefined) {
        event.description =
          description;
      }

      if (startTime !== undefined) {
        if (!startTime.trim()) {
          return res.status(400).json({
            message:
              "Start time cannot be empty",
          });
        }

        event.startTime =
          startTime.trim();
      }

      if (image !== undefined) {
        event.image = image;
      }

        //  UPDATE EVENT DATE

      if (date !== undefined) {
        if (!isValidDate(date)) {
          return res.status(400).json({
            message:
              "Invalid event date",
          });
        }

        event.date = new Date(date);
      }

        //  UPDATE SALES CLOSING DATE

      if (
        salesClosingDate !==
        undefined
      ) {
        if (
          !isValidDate(
            salesClosingDate
          )
        ) {
          return res.status(400).json({
            message:
              "Invalid sales closing date",
          });
        }

        event.salesClosingDate =
          new Date(
            salesClosingDate
          );
      }

        //  MAKE SURE SALES CLOSES BEFORE EVENT

      if (
        event.salesClosingDate >=
        event.date
      ) {
        return res.status(400).json({
          message:
            "Ticket sales closing date must be before the event date",
        });
      }

        //  UPDATE PRICE

      if (
        ticketPrice !==
        undefined
      ) {
        const parsedPrice =
          Number(ticketPrice);

        if (
          Number.isNaN(
            parsedPrice
          ) ||
          parsedPrice < 0
        ) {
          return res.status(400).json({
            message:
              "Ticket price must be a valid positive number",
          });
        }

        event.ticketPrice =
          parsedPrice;
      }

      await event.save();

      const updatedEvent =
        await Event.findById(
          event._id
        )
          .populate(
            "venueId",
            "name description address city capacity rows seatsPerRow"
          )
          .populate(
            "createdBy",
            "name email role"
          );

      res.json(
        updatedEvent
      );
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to update event",
        error: error.message,
      });
    }
  }
);


  //  EVENT — DELETE

app.delete(
  "/api/events/:id",
  authenticateUser,
  authorizeRoles(
    "Venue Manager",
    "Administrator"
  ),
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message: "Invalid event ID",
        });
      }

      const event =
        await Event.findById(
          req.params.id
        );

      if (!event) {
        return res.status(404).json({
          message: "Event not found",
        });
      }

      const venue =
        await Venue.findById(
          event.venueId
        );

      if (
        req.user.role === "Venue Manager" &&
        venue &&
        venue.managerId &&
        venue.managerId.toString() !==
          req.user._id.toString()
      ) {
        return res.status(403).json({
          message:
            "You can only delete events belonging to your venues",
        });
      }

        //  DON'T DELETE EVENTS WITH BOOKINGS 

      const existingBooking =
        await Booking.findOne({
          eventId: event._id,
          status: {
            $ne: "Cancelled",
          },
        });

      if (existingBooking) {
        return res.status(400).json({
          message:
            "Cannot delete an event that has active bookings",
        });
      }

      await Event.findByIdAndDelete(
        req.params.id
      );

      res.json({
        message:
          "Event deleted successfully",
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to delete event",
        error: error.message,
      });
    }
  }
);


  //   SEAT GENERATION


app.get(
  "/api/events/:id/seats",
  async (req, res) => {
    try {
        //  VALIDATE EVENT ID

      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message: "Invalid event ID",
        });
      }

        //  FIND EVENT

      const event =
        await Event.findById(
          req.params.id
        );

      if (!event) {
        return res.status(404).json({
          message: "Event not found",
        });
      }

        //  FIND VENUE
       

      const venue =
        await Venue.findById(
          event.venueId
        );

      if (!venue) {
        return res.status(404).json({
          message:
            "Venue associated with this event was not found",
        });
      }

        //  GENERATE ALL SEATS

      const allSeats =
        generateSeats(
          venue.rows,
          venue.seatsPerRow
        );

    
      const bookings =
        await Booking.find({
          eventId: event._id,
          status: {
            $ne: "Cancelled",
          },
        }).select("seats");


      const bookedSeats =
        new Set();

      bookings.forEach(
        (booking) => {
          booking.seats.forEach(
            (seat) => {
              bookedSeats.add(
                seat.toUpperCase()
              );
            }
          );
        }
      );


      const seats =
        allSeats.map(
          (seatNumber) => ({
            seatNumber,
            price:
              event.ticketPrice,
            status:
              bookedSeats.has(
                seatNumber
              )
                ? "Booked"
                : "Available",
          })
        );

        //  RESPONSE

      res.json({
        event: {
          id: event._id,
          title: event.title,
          ticketPrice:
            event.ticketPrice,
        },

        venue: {
          id: venue._id,
          name: venue.name,
          rows: venue.rows,
          seatsPerRow:
            venue.seatsPerRow,
          capacity:
            venue.capacity,
        },

        totalSeats:
          allSeats.length,

        availableSeats:
          allSeats.length -
          bookedSeats.size,

        bookedSeats:
          bookedSeats.size,

        seats,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to generate seats",
        error: error.message,
      });
    }
  }
);


  //  GET AVAILABLE SEATS ONLY

app.get(
  "/api/events/:id/seats/available",
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message: "Invalid event ID",
        });
      }

      const event =
        await Event.findById(
          req.params.id
        );

      if (!event) {
        return res.status(404).json({
          message: "Event not found",
        });
      }

      const venue =
        await Venue.findById(
          event.venueId
        );

      if (!venue) {
        return res.status(404).json({
          message: "Venue not found",
        });
      }

      const allSeats =
        generateSeats(
          venue.rows,
          venue.seatsPerRow
        );

      const bookings =
        await Booking.find({
          eventId: event._id,
          status: {
            $ne: "Cancelled",
          },
        }).select("seats");

      const bookedSeats =
        new Set();

      bookings.forEach(
        (booking) => {
          booking.seats.forEach(
            (seat) => {
              bookedSeats.add(
                seat.toUpperCase()
              );
            }
          );
        }
      );

      const availableSeats =
        allSeats.filter(
          (seat) =>
            !bookedSeats.has(
              seat
            )
        );

      res.json({
        eventId:
          event._id,

        ticketPrice:
          event.ticketPrice,

        availableSeats,
        count:
          availableSeats.length,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to get available seats",
        error: error.message,
      });
    }
  }
);

  //  BOOKING 


  
app.post(
  "/api/bookings",
  authenticateUser,
  authorizeRoles("Customer"),
  async (req, res) => {
    try {
      const {
        eventId,
        seats,
      } = req.body;


      if (!eventId || !seats) {
        return res.status(400).json({
          message:
            "eventId and seats are required",
        });
      }

      if (!Array.isArray(seats)) {
        return res.status(400).json({
          message:
            "seats must be an array",
        });
      }

      if (seats.length === 0) {
        return res.status(400).json({
          message:
            "At least one seat must be selected",
        });
      }

        //  LIMIT NUMBER OF SEATS

      if (seats.length > 20) {
        return res.status(400).json({
          message:
            "You cannot book more than 20 seats at once",
        });
      }

      if (
        !mongoose.Types.ObjectId.isValid(
          eventId
        )
      ) {
        return res.status(400).json({
          message: "Invalid event ID",
        });
      }


      const event =
        await Event.findById(
          eventId
        );

      if (!event) {
        return res.status(404).json({
          message: "Event not found",
        });
      }


      const now = new Date();

      if (
        now >=
        new Date(
          event.salesClosingDate
        )
      ) {
        return res.status(400).json({
          message:
            "Ticket sales for this event have closed",
        });
      }


      const venue =
        await Venue.findById(
          event.venueId
        );

      if (!venue) {
        return res.status(404).json({
          message:
            "Venue associated with this event was not found",
        });
      }

        //  NORMALIZE SEAT NUMBERS

      const normalizedSeats =
        seats.map((seat) =>
          String(seat)
            .trim()
            .toUpperCase()
        );

        //  REMOVE DUPLICATE SEATS FROM
        //  THE SAME REQUEST

      const uniqueSeats =
        [...new Set(
          normalizedSeats
        )];

      if (
        uniqueSeats.length !==
        normalizedSeats.length
      ) {
        return res.status(400).json({
          message:
            "The same seat cannot be selected more than once",
        });
      }

        //  GENERATE VALID VENUE SEATS

      const validSeats =
        generateSeats(
          venue.rows,
          venue.seatsPerRow
        );

      const validSeatSet =
        new Set(validSeats);

        //  CHECK THAT ALL REQUESTED
        //  SEATS ACTUALLY EXIST

      const invalidSeats =
        uniqueSeats.filter(
          (seat) =>
            !validSeatSet.has(
              seat
            )
        );

      if (
        invalidSeats.length > 0
      ) {
        return res.status(400).json({
          message:
            "One or more selected seats do not exist",
          invalidSeats,
        });
      }

        //  CHECK CURRENTLY BOOKED SEATS

      const existingBookings =
        await Booking.find({
          eventId: event._id,
          status: {
            $ne: "Cancelled",
          },
          seats: {
            $in: uniqueSeats,
          },
        }).select(
          "seats bookingReference"
        );

      const alreadyBooked =
        new Set();

      existingBookings.forEach(
        (booking) => {
          booking.seats.forEach(
            (seat) => {
              alreadyBooked.add(
                seat.toUpperCase()
              );
            }
          );
        }
      );

      const unavailableSeats =
        uniqueSeats.filter(
          (seat) =>
            alreadyBooked.has(
              seat
            )
        );

        //  REJECT ALREADY BOOKED SEATS */

      if (
        unavailableSeats.length > 0
      ) {
        return res.status(409).json({
          message:
            "One or more selected seats are already booked",
          unavailableSeats,
        });
      }

        //  CALCULATE TOTAL ON BACKEND

      const totalPrice =
        uniqueSeats.length *
        event.ticketPrice;

        //  CREATE BOOKING

      const bookingReference =
        generateBookingReference();

      try {
        const booking =
          await Booking.create({
            customerId:
              req.user._id,

            eventId:
              event._id,

            venueId:
              venue._id,

            seats:
              uniqueSeats,

            totalPrice,

            status:
              "Confirmed",

            bookingReference,
          });

        const populatedBooking =
          await Booking.findById(
            booking._id
          )
            .populate(
              "customerId",
              "name email role"
            )
            .populate(
              "eventId",
              "title description date startTime ticketPrice image"
            )
            .populate(
              "venueId",
              "name address city"
            );

        return res.status(201).json({
          message:
            "Booking created successfully",

          booking:
            populatedBooking,
        });
      } catch (createError) {
    

        if (
          createError.code === 11000
        ) {
          return res.status(409).json({
            message:
              "One or more selected seats were booked by another customer",
            seats:
              uniqueSeats,
          });
        }

        throw createError;
      }
    } catch (error) {
      console.error(
        "Booking creation error:",
        error
      );

      res.status(500).json({
        message:
          "Failed to create booking",
        error: error.message,
      });
    }
  }
);


  //  BOOKING — GET CUSTOMER HISTORY



app.get(
  "/api/bookings/my",
  authenticateUser,
)

app.get(
  "/api/bookings/my",
  authenticateUser,
  authorizeRoles("Customer"),
  async (req, res) => {
    try {
      const bookings =
        await Booking.find({
          customerId:
            req.user._id,
        })
          .populate(
            "eventId",
            "title description date startTime ticketPrice image"
          )
          .populate(
            "venueId",
            "name address city"
          )
          .sort({
            createdAt: -1,
          });

      res.json({
        count:
          bookings.length,

        bookings,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to get booking history",
        error: error.message,
      });
    }
  }
);

  //  BOOKING — GET SINGLE CUSTOMER BOOKING

app.get(
  "/api/bookings/:id",
  authenticateUser,
  authorizeRoles("Customer"),
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid booking ID",
        });
      }

      const booking =
        await Booking.findById(
          req.params.id
        )
          .populate(
            "eventId",
            "title description date startTime ticketPrice image"
          )
          .populate(
            "venueId",
            "name address city"
          );

      if (!booking) {
        return res.status(404).json({
          message:
            "Booking not found",
        });
      }

        //  CUSTOMER OWNERSHIP CHECK

      if (
        booking.customerId.toString() !==
        req.user._id.toString()
      ) {
        return res.status(403).json({
          message:
            "You can only view your own bookings",
        });
      }

      res.json(booking);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to get booking",
        error: error.message,
      });
    }
  }
);


  //  BOOKING — CANCEL
 

app.put(
  "/api/bookings/:id/cancel",
  authenticateUser,
  authorizeRoles("Customer"),
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid booking ID",
        });
      }

      const booking =
        await Booking.findById(
          req.params.id
        );

      if (!booking) {
        return res.status(404).json({
          message:
            "Booking not found",
        });
      }

        //  OWNERSHIP CHECK

      if (
        booking.customerId.toString() !==
        req.user._id.toString()
      ) {
        return res.status(403).json({
          message:
            "You can only cancel your own bookings",
        });
      }

        //  ALREADY CANCELLED
       

      if (
        booking.status ===
        "Cancelled"
      ) {
        return res.status(400).json({
          message:
            "Booking is already cancelled",
        });
      }

      booking.status =
        "Cancelled";

      await booking.save();

      res.json({
        message:
          "Booking cancelled successfully",

        booking,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to cancel booking",
        error: error.message,
      });
    }
  }
);


  //  ADMIN — VIEW ALL BOOKINGS

app.get(
  "/api/bookings",
  authenticateUser,
  authorizeRoles("Administrator"),
  async (req, res) => {
    try {
      const bookings =
        await Booking.find()
          .populate(
            "customerId",
            "name email role"
          )
          .populate(
            "eventId",
            "title date startTime ticketPrice"
          )
          .populate(
            "venueId",
            "name address city"
          )
          .sort({
            createdAt: -1,
          });

      res.json({
        count:
          bookings.length,

        bookings,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to get bookings",
        error: error.message,
      });
    }
  }
);


  //  VENUE MANAGER — VIEW EVENT BOOKINGS

app.get(
  "/api/events/:id/bookings",
  authenticateUser,
  authorizeRoles(
    "Venue Manager",
    "Administrator"
  ),
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid event ID",
        });
      }

      const event =
        await Event.findById(
          req.params.id
        );

      if (!event) {
        return res.status(404).json({
          message:
            "Event not found",
        });
      }

      const venue =
        await Venue.findById(
          event.venueId
        );

      if (!venue) {
        return res.status(404).json({
          message:
            "Venue not found",
        });
      }

        //  VENUE MANAGER OWNERSHIP

      if (
        req.user.role ===
          "Venue Manager" &&
        venue.managerId &&
        venue.managerId.toString() !==
          req.user._id.toString()
      ) {
        return res.status(403).json({
          message:
            "You can only view bookings for your own venues",
        });
      }

      const bookings =
        await Booking.find({
          eventId:
            event._id,

          status: {
            $ne: "Cancelled",
          },
        })
          .populate(
            "customerId",
            "name email"
          )
          .sort({
            createdAt: -1,
          });

      res.json({
        event: {
          id: event._id,
          title: event.title,
          date: event.date,
        },

        venue: {
          id: venue._id,
          name: venue.name,
        },

        totalBookings:
          bookings.length,

        bookings,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to get event bookings",
        error: error.message,
      });
    }
  }
);

  // PAYMENT — CREATE PAYMENT RECORD


app.post(
  "/api/payments",
  authenticateUser,
  authorizeRoles("Customer"),
  async (req, res) => {
    try {
      const {
        bookingId,
      } = req.body;

      if (!bookingId) {
        return res.status(400).json({
          message:
            "bookingId is required",
        });
      }

      if (
        !mongoose.Types.ObjectId.isValid(
          bookingId
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid booking ID",
        });
      }

      const booking =
        await Booking.findById(
          bookingId
        );

      if (!booking) {
        return res.status(404).json({
          message:
            "Booking not found",
        });
      }

        //  CHECK BOOKING OWNER

      if (
        booking.customerId.toString() !==
        req.user._id.toString()
      ) {
        return res.status(403).json({
          message:
            "You can only pay for your own bookings",
        });
      }

        //  CHECK BOOKING STATUS

      if (
        booking.status ===
        "Cancelled"
      ) {
        return res.status(400).json({
          message:
            "Cannot pay for a cancelled booking",
        });
      }

        //  CHECK EXISTING PAYMENT

      const existingPayment =
        await Payment.findOne({
          bookingId:
            booking._id,
          status:
            "Successful",
        });

      if (existingPayment) {
        return res.status(409).json({
          message:
            "This booking has already been paid",
          payment:
            existingPayment,
        });
      }

        //  GENERATE PAYMENT REFERENCE

      const paymentReference =
        `PAY-${Date.now()}-${crypto
          .randomBytes(3)
          .toString("hex")
          .toUpperCase()}`;

        //  CREATE PAYMENT

      const payment =
        await Payment.create({
          bookingId:
            booking._id,

         

          amount:
            booking.totalPrice,

          reference:
            paymentReference,

          status:
            "Pending",
        });

      res.status(201).json({
        message:
          "Payment record created",

        payment,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to create payment",
        error: error.message,
      });
    }
  }
);


  //  PAYMENT — GET MY PAYMENTS

app.get(
  "/api/payments/my",
  authenticateUser,
  authorizeRoles("Customer"),
  async (req, res) => {
    try {
      const bookings =
        await Booking.find({
          customerId:
            req.user._id,
        }).select("_id");

      const bookingIds =
        bookings.map(
          (booking) =>
            booking._id
        );

      const payments =
        await Payment.find({
          bookingId: {
            $in: bookingIds,
          },
        })
          .populate(
            "bookingId",
            "bookingReference totalPrice status seats"
          )
          .sort({
            createdAt: -1,
          });

      res.json({
        count:
          payments.length,

        payments,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to get payments",
        error: error.message,
      });
    }
  }
);




app.post(
  "/api/payments/callback",
  async (req, res) => {
    try {
      const {
        reference,
        status,
      } = req.body;

      if (!reference || !status) {
        return res.status(400).json({
          message:
            "reference and status are required",
        });
      }

      const payment =
        await Payment.findOne({
          reference,
        });

      if (!payment) {
        return res.status(404).json({
          message:
            "Payment not found",
        });
      }

      const allowedStatuses = [
        "Pending",
        "Successful",
        "Failed",
      ];

      if (
        !allowedStatuses.includes(
          status
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid payment status",
        });
      }

      payment.status =
        status;

      await payment.save();


      if (
        status ===
        "Successful"
      ) {
        await Booking.findByIdAndUpdate(
          payment.bookingId,
          {
            status:
              "Confirmed",
          }
        );
      }

      res.json({
        message:
          "Payment callback processed",

        payment,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to process payment callback",
        error: error.message,
      });
    }
  }
);


  //  ADMIN — USER MANAGEMENT

app.get(
  "/api/admin/users",
  authenticateUser,
  authorizeRoles("Administrator"),
  async (req, res) => {
    try {
      const users = await User.find()
        .select("-__v")
        .sort({
          createdAt: -1,
        });

      res.json({
        count: users.length,
        users,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to get users",
        error: error.message,
      });
    }
  }
);


  //  ADMIN — UPDATE USER ROLE
 

app.put(
  "/api/admin/users/:id/role",
  authenticateUser,
  authorizeRoles("Administrator"),
  async (req, res) => {
    try {
      const {
        role,
      } = req.body;

      const allowedRoles = [
        "Customer",
        "Venue Manager",
        "Administrator",
      ];

      if (
        !allowedRoles.includes(role)
      ) {
        return res.status(400).json({
          message:
            "Invalid role. Allowed roles are Customer, Venue Manager and Administrator",
        });
      }

      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid user ID",
        });
      }

      const user =
        await User.findById(
          req.params.id
        );

      if (!user) {
        return res.status(404).json({
          message:
            "User not found",
        });
      }

      user.role = role;

      await user.save();

  //  ADMIN — UPDATE USER ROLE

      res.json({
        message:
          "User role updated successfully",

        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to update user role",
        error: error.message,
      });
    }
  }
);


  //  ADMIN — PLATFORM STATISTICS

app.get(
  "/api/admin/stats",
  authenticateUser,
  authorizeRoles("Administrator"),
  async (req, res) => {
    try {
      const [
        users,
        venues,
        events,
        bookings,
        payments,
      ] = await Promise.all([
        User.countDocuments(),

        Venue.countDocuments(),

        Event.countDocuments(),

        Booking.countDocuments({
          status: {
            $ne: "Cancelled",
          },
        }),

        Payment.countDocuments({
          status:
            "Successful",
        }),
      ]);

      const revenueResult =
        await Payment.aggregate([
          {
            $match: {
              status:
                "Successful",
            },
          },

          {
            $group: {
              _id: null,

              totalRevenue: {
                $sum: "$amount",
              },
            },
          },
        ]);

      const totalRevenue =
        revenueResult.length > 0
          ? revenueResult[0]
              .totalRevenue
          : 0;

      res.json({
        users,
        venues,
        events,
        bookings,
        successfulPayments:
          payments,
        totalRevenue,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to get platform statistics",
        error: error.message,
      });
    }
  }
);


  //  VENUE MANAGER — VENUE PERFORMANCE

app.get(
  "/api/venues/:id/performance",
  authenticateUser,
  authorizeRoles(
    "Venue Manager",
    "Administrator"
  ),
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid venue ID",
        });
      }

      const venue =
        await Venue.findById(
          req.params.id
        );

      if (!venue) {
        return res.status(404).json({
          message:
            "Venue not found",
        });
      }

        //  VENUE MANAGER OWNERSHIP

      if (
        req.user.role ===
          "Venue Manager" &&
        venue.managerId &&
        venue.managerId.toString() !==
          req.user._id.toString()
      ) {
        return res.status(403).json({
          message:
            "You can only view your own venue performance",
        });
      }

      const events =
        await Event.find({
          venueId:
            venue._id,
        }).select(
          "title date ticketPrice"
        );

      const eventIds =
        events.map(
          (event) =>
            event._id
        );

      const bookings =
        await Booking.find({
          eventId: {
            $in: eventIds,
          },

          status: {
            $ne: "Cancelled",
          },
        });

      let totalTickets = 0;
      let totalRevenue = 0;

      bookings.forEach(
        (booking) => {
          totalTickets +=
            booking.seats.length;

          totalRevenue +=
            Number(
              booking.totalPrice
            );
        }
      );

      res.json({
        venue: {
          id: venue._id,
          name: venue.name,
          capacity:
            venue.capacity,
        },

        events:
          events.length,

        bookings:
          bookings.length,

        ticketsSold:
          totalTickets,

        totalRevenue,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to get venue performance",
        error: error.message,
      });
    }
  }
);


  //  USER PROFILE


app.get(
  "/api/profile",
  authenticateUser,
  async (req, res) => {
    try {
      const user =
        await User.findById(
          req.user._id
        ).select("-__v");

      if (!user) {
        return res.status(404).json({
          message:
            "User profile not found",
        });
      }

      res.json(user);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to get profile",
        error: error.message,
      });
    }
  }
);


  //  USER PROFILE — UPDATE

app.put(
  "/api/profile",
  authenticateUser,
  async (req, res) => {
    try {
      const {
        name,
      } = req.body;

      if (
        name !== undefined
      ) {
        if (
          typeof name !==
            "string" ||
          !name.trim()
        ) {
          return res.status(400).json({
            message:
              "Name must be a valid non-empty string",
          });
        }

        req.user.name =
          name.trim();
      }

     

      await req.user.save();

      res.json({
        message:
          "Profile updated successfully",

        user: {
          id: req.user._id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
        },
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to update profile",
        error: error.message,
      });
    }
  }
);


  //  API INFORMATION

app.get(
  "/api",
  (req, res) => {
    res.json({
      name:
        "VenueFlow API",

      version:
        "1.0.0",

      message:
        "VenueFlow backend is running",

      endpoints: {
        auth:
          "/api/auth",

        profile:
          "/api/profile",

        venues:
          "/api/venues",

        events:
          "/api/events",

        bookings:
          "/api/bookings",

        payments:
          "/api/payments",

      },
    });
  }
);


  //  404 — UNKNOWN ROUTE

app.use(
  (req, res) => {
    res.status(404).json({
      message:
        "Route not found",

      method:
        req.method,

      path:
        req.originalUrl,
    });
  }
);


  //  GLOBAL ERROR HANDLER

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      "Global error:",
      error
    );

    /*
      Don't expose unnecessary
      internal information in production.
    */

    res.status(
      error.status || 500
    ).json({
      message:
        error.message ||
        "Internal server error",
    });
  }
);

//  SERVER

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI);


    app.listen(PORT, () => {
      console.log(
        `VenueFlow API running on port ${PORT}`
      );

     
    });

  } catch (error) {
    console.error(
      "Failed to start server:",
      error.message
    );

    process.exit(1);
  }
}

startServer();