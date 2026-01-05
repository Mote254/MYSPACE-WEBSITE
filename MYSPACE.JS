// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { User,AuditLog,Client,Admin,Contact } = require("./config");
const bcrypt = require("bcrypt"); 
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const flash = require("connect-flash");//flash  messages and session creation //
const { isAuthenticated, isAdmin } = require("./auth");
const multer = require("multer");


const app = express();

app.use(flash());

app.use(session({
  name: "myspace.sid",
  secret: process.env.SESSION_SECRET || "super-secret-key",
  resave: false,
  saveUninitialized: false,

  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: "sessions",
    ttl: 14 * 24 * 60 * 60 // 14 days
  }),

  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24, // 1 day
    secure: process.env.NODE_ENV === "production", // ✅ Render-safe
    sameSite: "lax"
  }
}));


// Middleware to make flash messages available in all views
app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  next();
});







// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'PUBLIC')));

// Set up EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


// Storage engine for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/"); // ensure this folder exists
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });


/* ==========================
   PAGES & ACCOUNT & ADMIN ROUTES
   ========================== */
console.log("Views directory:", app.get("VIEWS"));

app.get('/', (req, res) => {
  
  res.render('home', { title: "Welcome to MYSPACE" });
});

app.get('/about', (req, res) => {
  res.render('about', { title: "About Us" });
});

// GET contact page
app.get('/contact', (req, res) => {
  res.render('contact')
});

// DASHBOARD ROUTE
app.get("/dashboard", isAuthenticated, async (req, res) => {
  try {
    // Fetch all users
    const users = await User.find({}); 
    const currentUser = await User.findById(req.session.userId); // logged-in user

    if (!users || users.length === 0) {
      console.log("⚠️ No users found");
      return res.render("dashboard", { title: "DASHBOARD", products: [], currentUser });
    }

    // Collect all products with owner info
    const allProducts = [];
    users.forEach(u => {
      if (u.businessImages && u.businessImages.length > 0) {
        u.businessImages.forEach(img => {
        allProducts.push({
  _id: img._id?.toString() || null,
  url: img.url,
  name: img.name,
  price: img.price,
  description: img.description,
  category: img.category,
  location: img.location,
  ownerName: `${u.firstName || "Unknown"} ${u.lastName || ""}`,
  ownerId: u._id.toString(),
  ownerEmail: u.email
});

        });
      }
    });

    console.log(`📦 Total products found: ${allProducts.length}`);

    res.render("dashboard", {
      title: "DASHBOARD",
      products: allProducts,
      currentUser // <-- pass logged-in user if you need
    });

  } catch (error) {
    console.error("❌ Error loading dashboard:", error);
    req.flash("error_msg", "Could not load dashboard.");
    res.render("dashboard", { title: "DASHBOARD", products: [], currentUser: null });
  }
});


app.get('/policy', (req, res) => {
  res.render('policy', { title: "Policy" });
});

app.post('/contact', async (req, res) => {
  console.log("📥 /contact POST hit");
  console.log("➡️ Incoming body:", req.body);

  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      console.log("⚠️ Missing fields, cannot save");
      req.flash("error_msg", "❗ All fields are required.");
      return res.redirect('/contact');
    }

    console.log("💾 Creating contact doc...");
    const savedMessage = await Contact.create({ name, email, message });
    console.log("✅ Message saved to DB:", savedMessage);

    // Set flash success message
    console.log("🔔 Setting flash success message");
    req.flash("success_msg", "✅ Message sent successfully!");

    // Redirect back to contact page so flash can be shown there
    return res.redirect('/contact');

  } catch (err) {
    console.error("🔥 Error saving message:", err);
    req.flash("error_msg", "❗ There was an error sending your message.");
    return res.redirect('/contact');
  }
});



// Form submit route
app.post("/apply", async (req, res) => {
  try {
    const newUser = new User({
      firstName: req.body.firstName,
      secondName: req.body.secondName,
      lastName: req.body.lastName,
      businessName: req.body.businessName,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address,
    });

    await newUser.save();
    console.log("✅ User saved:", newUser);
    req.flash("success_msg", "🎉 Application submitted successfully!");
    res.redirect("/dashboard");

  
  } catch (error) {
    console.error("❌ Error saving user:", error);
    req.flash("error_msg", "Something went wrong. Try again.");

  }
});
// ADMIN PAGE CODE AND ROUTE AND LOGIC SET UP 

app.get("/admin", isAuthenticated, isAdmin, async (req, res) =>{
  try {
    const users = await User.find();
    res.render("admin", { title: "Admin Panel", users });
  } catch (error) {
    console.error("❌ Error loading admin page:", error);
    req.flash("error_msg", "Could not load admin panel.");
    res.render("admin", { title: "Admin Panel", users: [] });
  }
});

// Approve user -> Move from User to Client
app.get("/admin/approve/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      req.flash("error_msg", "User not found.");
      return res.redirect("/admin");
    }

    // Create client document from user data
    const client = new Client({
      user: user._id,    
      name: user.name,
      email: user.email,
      phone: user.phone,
                        // copy other relevant fields I need
      status: "approved", // mark user as approved
      createdAt: user.createdAt
    });

    await client.save();
    await User.findByIdAndDelete(user._id); // remove from users table

    // Save audit log
    try {
      const log = await AuditLog.create({
        performedBy: req.user ? req.user._id : null,
        action: "Approve User",
        targetUser: client._id,
        details: `Moved ${user.email} to Clients`
      });
      console.log("✅ Audit log saved (approve):", log);
    } catch (logError) {
      console.error("❌ Failed to save audit log (approve):", logError);
    }

    req.flash("success_msg", "✅ User approved and moved to Clients!");
    res.redirect("/admin");
  } catch (error) {
    console.error("❌ Error approving user:", error);
    req.flash("error_msg", "Could not approve user.");
    res.redirect("/admin");
  }
});

// ✅ Delete user
app.get("/admin/delete/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      req.flash("error_msg", "User not found.");
      return res.redirect("/admin");
    }

    try {
      const log = await AuditLog.create({
        performedBy: req.user ? req.user._id : null,
        action: "Delete User",
        targetUser: user._id,
        details: `Deleted ${user.email}`
      });
      console.log("✅ Audit log saved (delete):", log);
    } catch (logError) {
      console.error("❌ Failed to save audit log (delete):", logError);
    }

    req.flash("success_msg", "🗑️ User deleted successfully!");
    res.redirect("/admin");
  } catch (error) {
    console.error("❌ Error deleting user:", error);
    req.flash("error_msg", "Could not delete user.");
    res.redirect("/admin");
  }
});

// Suspend a client -> Move back to Users table
app.get("/admin/suspend/:id", async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      req.flash("error_msg", "Client not found.");
      return res.redirect("/admin");
    }

    // Create user again from client data
    const user = new User({
      _id: client.user, // keep same id ref if possible
      email: client.email,
      name: client.name,
      phone: client.phone,
      status: "suspended"
    });
    await user.save();

    // Remove from Clients table
    await Client.findByIdAndDelete(client._id);

    // Log action
    await AuditLog.create({
      performedBy: req.user ? req.user._id : null,
      action: "Suspend Client",
      targetUser: user._id,
      details: `Suspended ${user.email}`
    });

    req.flash("success_msg", "⚠️ Client suspended and moved back to Users!");
    res.redirect("/admin");
  } catch (error) {
    console.error("❌ Error suspending client:", error);
    req.flash("error_msg", "Could not suspend client.");
    res.redirect("/admin");
  }
});


// Unsuspend user -> Move back to Clients table
app.get("/admin/unsuspend/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      req.flash("error_msg", "User not found.");
      return res.redirect("/admin");
    }

    // Create new client from user data
    const client = new Client({
      user: user._id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      status: "approved" // once unsuspended, back to client side
    });
    await client.save();

    // Remove from Users table
    await User.findByIdAndDelete(user._id);

    // Log action
    await AuditLog.create({
      performedBy: req.user ? req.user._id : null,
      action: "Unsuspend User",
      targetUser: client._id,
      details: `Unsuspended ${client.email}`
    });

    req.flash("success_msg", "✅ User unsuspended and moved back to Clients!");
    res.redirect("/admin");
  } catch (error) {
    console.error("❌ Error unsuspending user:", error);
    req.flash("error_msg", "Could not unsuspend user.");
    res.redirect("/admin");
  }
});


// ✅ Ban user
app.get("/admin/ban/:id/:days", async (req, res) => {
  try {
    const days = parseInt(req.params.days, 10) || 0;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { ban: { status: true, days, bannedAt: new Date() } },
      { new: true }
    );

    if (!user) {
      req.flash("error_msg", "User not found.");
      return res.redirect("/admin");
    }

    try {
      const log = await AuditLog.create({
        performedBy: req.user ? req.user._id : null,
        action: "Ban User",
        targetUser: user._id,
        details: `Banned ${user.email} for ${days} days`
      });
      console.log("✅ Audit log saved (ban):", log);
    } catch (logError) {
      console.error("❌ Failed to save audit log (ban):", logError);
    }

    req.flash("success_msg", `🚫 User banned for ${days} days!`);
    res.redirect("/admin");
  } catch (error) {
    console.error("❌ Error banning user:", error);
    req.flash("error_msg", "Could not ban user.");
    res.redirect("/admin");
  }
});

// ✅ Unban user
app.get("/admin/unban/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { ban: { status: false, days: 0, bannedAt: null } },
      { new: true }
    );

    if (!user) {
      req.flash("error_msg", "User not found.");
      return res.redirect("/admin");
    }

    try {
      const log = await AuditLog.create({
        performedBy: req.user ? req.user._id : null,
        action: "Unban User",
        targetUser: user._id,
        details: `Unbanned ${user.email}`
      });
      console.log("✅ Audit log saved (unban):", log);
    } catch (logError) {
      console.error("❌ Failed to save audit log (unban):", logError);
    }

    req.flash("success_msg", "✅ User unbanned!");
    res.redirect("/admin");
  } catch (error) {
    console.error("❌ Error unbanning user:", error);
    req.flash("error_msg", "Could not unban user.");
    res.redirect("/admin");
  }
});




// Profile page
app.get("/profile", isAuthenticated, async (req, res) => {
  console.log("🚀 [GET /profile] Request received");

  try {
    // Log the session user ID
    console.log("🔑 Session userId:", req.session.userId);

    // Fetch the user
    const user = await User.findById(req.session.userId);

    if (!user) {
      console.warn("⚠️ User not found for ID:", req.session.userId);
      req.flash("error_msg", "Profile not found.");
      return res.redirect("/dashboard");
    }

    // Log the full user object for debugging (optional, can be huge)
    console.log("👤 User found:", {
      id: user._id,
      username: user.username || user.email,
      businessImagesCount: user.businessImages ? user.businessImages.length : 0
    });

    // Log all business images to check if data exists
    if (user.businessImages && user.businessImages.length > 0) {
      console.log("📦 Business Images:");
      user.businessImages.forEach((img, idx) => {
        console.log(`   [${idx}]`, {
          name: img.name,
          price: img.price,
          description: img.description,
          url: img.url
        });
      });
    } else {
      console.log("🟡 No business images found for this user.");
    }

    // Render the profile page
    console.log("📤 Rendering profile.ejs with user data");
    res.render("profile", {
      title: "Your Profile",
      user
    });

  } catch (error) {
    console.error("❌ Error loading profile route:", error);
    req.flash("error_msg", "Could not load profile.");
    res.redirect("/dashboard");
  }
});





// ====================================
// Profile Update Route
// ====================================

app.post(
  "/profile/update",
  upload.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "businessImages", maxCount: 20 }
  ]),
  async (req, res) => {
    console.log("🟢 ----- DEBUG START -----");
    console.log("req.body:", req.body);
    console.log("req.files:", req.files);

    const {
      productNames,
      productPrices,
      productDescriptions,
      productLocations,
      productCategories,
      productTypes,
      productBrands,
      productMaterials,
      productConditions,
      productColors,
      productFeatures
    } = req.body;

    try {
      const user = await User.findById(req.session.userId);
      if (!user) {
        console.log("❗ User not found");
        req.flash("error_msg", "User not found");
        return res.redirect("/profile");
      }

      // ===============================
      // ✅ Update basic profile fields
      // ===============================
      user.phone = req.body.phone;
      user.address = req.body.address;
      user.location = req.body.location;

      console.log("📱 Basic profile updated:", {
        phone: user.phone,
        address: user.address,
        location: user.location,
      });

      // ===============================
      // ✅ Handle profile photo
      // ===============================
      if (req.files.profileImage && req.files.profileImage.length > 0) {
        const profilePic = req.files.profileImage[0];
        user.profileImage = `/uploads/${profilePic.filename}`;
        console.log("🖼️ Profile image saved:", user.profileImage);
      }

      // ===============================
      // ✅ Handle uploaded product images
      // ===============================
      if (req.files.businessImages && req.files.businessImages.length > 0) {
        const productFiles = req.files.businessImages;

        console.log(`📦 Processing ${productFiles.length} product images`);

        productFiles.forEach((file, index) => {
          const getValue = (arr, idx) =>
            Array.isArray(arr) ? arr[idx] : arr;

          const product = {
            url: `/uploads/${file.filename}`,
            name: getValue(productNames, index) || "Unnamed Product",
            price: getValue(productPrices, index) || 0,
            description: getValue(productDescriptions, index) || "No description",
            location: getValue(productLocations, index) || user.location || "Unknown",
            category: getValue(productCategories, index) || "Uncategorized",
            type: getValue(productTypes, index)?.trim() || null,
            brand: getValue(productBrands, index)?.trim() || null,
            material: getValue(productMaterials, index)?.trim() || null,
            condition: getValue(productConditions, index)?.trim() || null,
            color: getValue(productColors, index)?.trim() || null,
            features: getValue(productFeatures, index)?.trim() || null,
          };

          console.log(`➡️ Product ${index + 1}:`, product);

          user.businessImages.push(product);
        });
      } else {
        console.log("⚠️ No new product images uploaded.");
      }

      // ===============================
      // ✅ Save user
      // ===============================
      await user.save();
      console.log("✅ User data saved successfully");
      console.log("🟢 ----- DEBUG END -----");

      req.flash("success_msg", "Profile updated successfully!");
      res.redirect("/profile");

    } catch (err) {
      console.error("❌ Error updating profile:", err);
      req.flash("error_msg", "Something went wrong while updating profile.");
      res.redirect("/profile");
    }
  }
);


   
// ====================================
// Profile delete Route
// ====================================

app.post("/profile/delete-image", isAuthenticated, async (req, res) => {
  try {
    const { imagePath } = req.body;
    console.log("🗑 Request to delete:", imagePath);

    const user = await User.findById(req.session.userId);
    if (!user) {
      req.flash("error_msg", "User not found.");
      return res.redirect("/profile");
    }

    // Filter out the image with the matching url
    user.businessImages = user.businessImages.filter(img => img.url !== imagePath);
    await user.save();

    // Delete the file itself
    const fileToDelete = path.join(__dirname, "public", imagePath.replace(/^\//, ''));
    if (fs.existsSync(fileToDelete)) {
      fs.unlinkSync(fileToDelete);
      console.log("🗑️ Deleted file from server:", fileToDelete);
    }

    req.flash("success_msg", "Image deleted successfully.");
    res.redirect("/profile");
  } catch (err) {
    console.error("❌ Error deleting image:", err);
    req.flash("error_msg", "Could not delete image.");
    res.redirect("/profile");
  }
});


// Register page
app.get("/register", (req, res) => {
  res.render("register", { title: "Register" });
});


//REGISTER ROUTE 
// REGISTER route
app.post("/register", async (req, res) => {
  try {
    const { firstName, secondName, lastName, businessName, phone, email, password } = req.body;

    // normalize email
    const emailNormalized = email.toLowerCase().trim();

    console.log("📥 Registration attempt:");
    console.log("   First:", firstName);
    console.log("   Email (normalized):", emailNormalized);
    console.log("   DB being used:", mongoose.connection.name); // ✅ current DB
    console.log("   Collections in DB so far:", await mongoose.connection.db.listCollections().toArray());

    // check if email exists
    const existingUser = await User.findOne({ email: emailNormalized });
    console.log("🔍 Existing user lookup result:", existingUser ? existingUser.email : "❌ None");

    if (existingUser) {
      return res.status(400).send("User with this email already exists.");
    }

    // create user
    const newUser = new User({
      firstName,
      secondName,
      lastName,
      businessName,
      phone,
      email: emailNormalized,
      password
    });

    await newUser.save();

    console.log("✅ User registered successfully");
    console.log("   Saved in collection:", newUser.collection.name); // ✅ which collection
    console.log("   Saved user document:", newUser);

    res.redirect("/login");

  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).send("Something went wrong. Please try again.");
  }
});


// Login page
app.get("/login", (req, res) => {
  console.log("💬 Flash messages on GET /login -> Errors:", req.flash("error_msg"), "Successes:", req.flash("success_msg"));
  res.render("login", { title: "Login" });
});

// LOGIN POST ROUTE
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  console.log("📥 Login attempt with email:", email);
  console.log("📥 Password entered:", password);

  try {
    console.log("   DB being used:", mongoose.connection.name); // ✅ check DB name
    console.log("   Collections in DB:", await mongoose.connection.db.listCollections().toArray());

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    console.log("🔍 User lookup result:", user ? user.email : "❌ No user found");

    if (!user) {
      console.log("⚠️ No account found for email:", email);
      req.flash("error_msg", "No account found.");
      return res.redirect("/login");
    }

    if (user.suspended) {
      console.log("⛔ User is suspended:", user.email);
      req.flash("error_msg", "Your account is suspended.");
      return res.redirect("/login");
    }

    console.log("🔑 Stored hash in DB:", user.password);
    const isMatch = await user.comparePassword(password);
    console.log("🔑 Password match result:", isMatch);

    if (!isMatch) {
      console.log("❌ Invalid password for user:", email);
      req.flash("error_msg", "Invalid credentials.");
      return res.redirect("/login");
    }

    // ✅ store user session
    req.session.userId = user._id;
    req.session.role = user.role;
    console.log("✅ Session set -> userId:", req.session.userId, "role:", req.session.role);

    req.flash("success_msg", "✅ Logged in!");
    console.log("➡️ Redirecting to /dashboard");
    return res.redirect("/dashboard");

  } catch (err) {
    console.error("🔥 Login error:", err);
    req.flash("error_msg", "Login failed.");
    return res.redirect("/login");
  }
});


// logout route 
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("❌ Logout error:", err);
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
});


app.get("/search", async (req, res) => {
  try {
    const query = req.query.q?.trim();
    console.log("🚀 /search route hit");
    console.log("🔍 Incoming query:", query || "(no query provided)");

    if (!query) {
      console.log("⚠️ Empty query received — returning []");
      return res.json([]);
    }

    // Search within businessImages array inside each user
    console.log("🧠 Running MongoDB search...");
    const users = await User.find({
      "businessImages.name": { $regex: query, $options: "i" } // case-insensitive
    });

    console.log(`👥 Users found with matching businessImages: ${users.length}`);
    if (users.length > 0) {
      users.forEach((u, i) => {
        console.log(`   ➤ User ${i + 1}: ${u.username || u.email}`);
        console.log(`     🖼️ businessImages count: ${u.businessImages?.length || 0}`);
      });
    }

    // Flatten all matching images
    const results = [];
    users.forEach((u, i) => {
      if (!Array.isArray(u.businessImages)) return;
      u.businessImages.forEach((img, j) => {
        if (img.name && img.name.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            name: img.name,
            price: img.price,
            description: img.description,
            location: img.location,
            url: img.url,
            seller: u.username || u.email || "Unknown"
          });
          console.log(
            `✅ Match found — User ${i + 1} (${u.username || u.email}) → Image ${j + 1}: ${img.name}`
          );
        }
      });
    });

    console.log("📦 Total matching products:", results.length);
    if (results.length > 0) {
      console.log("🧾 Sample result:", results[0]);
    } else {
      console.log("⚠️ No products matched your search term.");
    }

    res.json(results);
  } catch (err) {
    console.error("❌ Error during search:", err.message);
    console.error("🧨 Stack Trace:", err.stack);
    res.status(500).json({ error: "Server error" });
  }
});

app.get(/^\/category\/(.+)/, async (req, res) => {
  const slug = req.params[0]; // e.g. "farming/livestock/goats"
  console.log("🧭 Category slug:", slug);

  try {
    const users = await User.find({
      "businessImages.category": { $regex: new RegExp(slug, "i") }
    });

    const results = [];

    users.forEach(user => {
      (user.businessImages || []).forEach(img => {
        if (new RegExp(slug, "i").test(img.category)) {
          results.push({
            name: img.name,
            price: img.price,
            description: img.description,
            location: img.location,
            url: img.url,
            seller: user.username || user.email || "Unknown",
            category: img.category
          });
        }
      });
    });

    console.log(`📦 Found ${results.length} products for category "${slug}"`);
    res.json(results); // 👈🏽 returns JSON, not renders EJS

  } catch (err) {
    console.error("🔥 Category load error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//FILTER ROUTE//

app.get("/filter", async (req, res) => {
  try {
    console.log("🧩 Received filters:", req.query);

    const { minPrice, maxPrice, location, type, color, brand, features } = req.query;

    // Build dynamic filter query for nested array fields
    const query = {};

    if (minPrice || maxPrice) {
      query["businessImages.price"] = {};
      if (minPrice) query["businessImages.price"]["$gte"] = parseFloat(minPrice);
      if (maxPrice) query["businessImages.price"]["$lte"] = parseFloat(maxPrice);
    }

    if (location) query["businessImages.location"] = { $regex: location, $options: "i" };
    if (type) query["businessImages.type"] = { $regex: type, $options: "i" };
    if (color) query["businessImages.color"] = { $regex: color, $options: "i" };
    if (brand) query["businessImages.brand"] = { $regex: brand, $options: "i" };
    if (features) query["businessImages.features"] = { $regex: features, $options: "i" };

    console.log("🔍 Built MongoDB Query:", JSON.stringify(query, null, 2));

    // Fetch only relevant users
    const users = await User.find(query);
    console.log(`🧠 Found ${users.length} user(s) with matching businessImages.`);

    // Extract and filter only matching businessImages
    const filteredProducts = [];

    users.forEach(user => {
      if (user.businessImages && user.businessImages.length > 0) {
        user.businessImages.forEach(img => {
          // Apply the same logic manually to filter at the product level
          const price = parseFloat(img.price);
          const matchPrice =
            (!minPrice || price >= parseFloat(minPrice)) &&
            (!maxPrice || price <= parseFloat(maxPrice));
          const matchLocation = !location || img.location?.toLowerCase().includes(location.toLowerCase());
          const matchType = !type || img.type?.toLowerCase().includes(type.toLowerCase());
          const matchColor = !color || img.color?.toLowerCase().includes(color.toLowerCase());
          const matchBrand = !brand || img.brand?.toLowerCase().includes(brand.toLowerCase());
          const matchFeatures = !features || img.features?.toLowerCase().includes(features.toLowerCase());

          if (matchPrice && matchLocation && matchType && matchColor && matchBrand && matchFeatures) {
            filteredProducts.push({
              url: img.url,
              name: img.name,
              price: img.price,
              description: img.description,
              location: img.location,
              category: img.category,
              type: img.type,
              color: img.color,
              brand: img.brand,
              features: img.features,
            });
          }
        });
      }
    });

    console.log(`🎯 Total matching products: ${filteredProducts.length}`);
    res.json(filteredProducts);

  } catch (err) {
    console.error("❌ Filter route error:", err);
    res.status(500).json({ message: "Server error applying filters" });
  }
});
app.get("/dashboard/contact/:index", isAuthenticated, async (req, res) => {
  try {
    // 1️⃣ Fetch the logged-in user
    const user = await User.findById(req.session.userId).lean();

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // 2️⃣ Ensure the product index exists
    const index = parseInt(req.params.index);
    const product = user.businessImages[index];

    if (!product) {
      return res.status(404).json({ error: "Product not found." });
    }

    // 3️⃣ Return contact info from the user, not the product
    res.json({
      contactName: user.firstName + " " + (user.lastName || ""), // full name
      contactPhone: user.phone || "Not provided",
      contactEmail: user.email || "Not provided",
    });

  } catch (error) {
    console.error("❌ Error fetching contact info:", error);
    res.status(500).json({ error: "Server error." });
  }
});

//BOOKMARKS BAR CODE

app.get("/profile/bookmarks", async (req, res) => {
  try {
    const userId = req.session.user?._id;
    if (!userId) return res.redirect("/profile");

    const user = await User.findById(userId);

    res.render("profile-bookmarks", {
      user,
      bookmarks: user.bookmarks || []
    });

  } catch (err) {
    console.error("❌ Error loading bookmarks:", err);
    res.status(500).send("Server error loading bookmarks");
  }
});

//MESSAGES BAR CODE
app.get("/profile/messages", async (req, res) => {
  try {
    const userId = req.session.user?._id;
    if (!userId) return res.redirect("/login");

    const user = await User.findById(userId);

    res.render("profile-messages", {
      user,
      messages: user.messages || []
    });

  } catch (err) {
    console.error("❌ Error loading messages:", err);
    res.status(500).send("Server error loading messages");
  }
});

//CART BAR CODE
app.get("/profile/cart", async (req, res) => {
  try {
    const userId = req.session.user?._id;
    if (!userId) return res.redirect("/login");

    const user = await User.findById(userId);

    res.render("profile-cart", {
      user,
      cart: user.cart || []
    });

  } catch (err) {
    console.error("❌ Error loading cart:", err);
    res.status(500).send("Server error loading cart");
  }
});



// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
