// config/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcrypt"); // ⬅️ make sure this is at the top!


// ----------------- BASE USER SCHEMA -----------------
const options = { discriminatorKey: "kind", timestamps: true };

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  secondName: { type: String },
  lastName: { type: String },
  businessName: { type: String },
  phone: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  address: { type: String },
  profileImage: { type: String },

  businessImages: [
    {
      url: { type: String, required: true },
      name: { type: String, required: true },
      price: { type: Number, required: true },
      description: { type: String, required: true },
      location: { type: String, default: null },
      category: { type: String, default: "Uncategorized" },
      type: { type: String, default: null },
      brand: { type: String, default: null },
      material: { type: String, default: null },
      condition: { type: String, enum: ["Used", "Brand New", "Refurbished", null], default: null },
      color: { type: String, default: null },
      features: { type: String, default: null }
    }
  ],

  location: { type: String },

  /* ⭐ NEW: BOOKMARKS */
  bookmarks: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      savedAt: { type: Date, default: Date.now }
    }
  ],

  /* ⭐ NEW: CART */
  cart: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      quantity: { type: Number, default: 1 },
      addedAt: { type: Date, default: Date.now }
    }
  ],

  /* ⭐ NEW: MESSAGES */
  messages: [
    {
      from: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      to: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      message: { type: String },
      sentAt: { type: Date, default: Date.now }
    }
  ],

  role: { type: String, enum: ["user", "client", "admin"], default: "user" },
  approved: { type: Boolean, default: false },
  suspended: { type: Boolean, default: false },

  ban: {
    status: { type: Boolean, default: false },
    days: { type: Number, default: 0 },
    bannedAt: { type: Date, default: null }
  }
}, options);
// ----------------- MIDDLEWARE -----------------
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next(); // only hash if changed
  try {
    console.log("🔐 Hashing password for user:", this.email);
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    console.log("✅ Password hashed successfully");
    next();
  } catch (err) {
    console.error("❌ Error hashing password:", err);
    next(err);
  }
});

// ----------------- METHODS -----------------
userSchema.methods.comparePassword = async function (candidatePassword) {
  console.log("👉 Candidate:", candidatePassword);
  console.log("👉 Stored:", this.password);
  return bcrypt.compare(candidatePassword, this.password);
};

// ----------------- BASE MODEL -----------------
const User = mongoose.model("User", userSchema);

// ----------------- CLIENT DISCRIMINATOR -----------------
const clientSchema = new mongoose.Schema({
  coverImage: { type: String, default: "" },
  bio: { type: String, default: "" },
  website: { type: String, default: "" },
  socialLinks: {
    facebook: { type: String, default: "" },
    instagram: { type: String, default: "" },
    twitter: { type: String, default: "" },
    linkedin: { type: String, default: "" }
  },
  status: { 
    type: String, 
    enum: ["pending", "approved", "suspended"], 
    default: "pending" 
  }
});

// Client inherits from User
const Client = User.discriminator("Client", clientSchema);



// ----------------- ADMIN SCHEMA -----------------
const adminSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  permissions: {
    manageUsers: { type: Boolean, default: true },
    manageContent: { type: Boolean, default: false },
    viewAuditLogs: { type: Boolean, default: true },
    superAdmin: { type: Boolean, default: false }
  },
  assignedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const Admin = mongoose.model("Admin", adminSchema);

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true },          
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, 
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" }, 
  details: { type: String }, // 👈 add this so your messages are stored
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

// ----------------- CONTACT SCHEMA -----------------
const contactSchema = new mongoose.Schema({
  name: { type: String},
  email: { type: String},
  message: { type: String},
   createdAt: { type: Date, default: Date.now }
});
const Contact = mongoose.model("Contact", contactSchema);

// ---------------------------------- EXPORT MODELS -----------------
module.exports = { User, Admin, AuditLog , Client, Contact };
