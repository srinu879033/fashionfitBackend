const express = require("express");
const { MongoClient } = require("mongodb");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
const dotenv = require("dotenv");
const cors = require("cors");
dotenv.config();

const PORT = process.env.PORT || 3011;

app.use(express.json());
app.use(cors());
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE");
  res.set(
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers,Authorization"
  );
  next();
});
function generateOTP() {
  var digits = "0123456789";
  let OTP = "";
  for (let i = 0; i < 6; i++) {
    OTP += digits[Math.floor(Math.random() * 10)];
  }
  return OTP;
}

const categories = [
  "",
  "Clothes",
  "Electronics",
  "Appliances",
  "Grocery",
  "Toys",
];

let client = null;

const initializeDbAndServer = async () => {
  const uri = process.env.MONGO_URI;
  client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  try {
    app.listen(PORT, () =>
      console.log(`Server Running at http://localhost:${PORT}/`)
    );
    await client.connect(async (err) => {
      console.log("Database Started");
      /*for (let i = 1; i <= 54; i++) {
        /* const apiUrl = `https://apis.ccbp.in/products/${i}`;
        const options = {
          headers: {
            Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InJhamEiLCJyb2xlIjoiVVNFUiIsImlhdCI6MTYyMzA2NTUzMn0.UEOQcIZXSvDOB9uQXLLDjHsZtYbQ6LzndIItbVhg-e4`,
          },
          method: "GET",
        };
        let result = await client
          .db("knock-knock")
          .collection("eachProductDetails")
          .insertOne();
      }*/
      apiServices(client);
    });
  } catch (error) {
    console.log(`DB Error:${error.message}`);
  } finally {
    console.log("Database closed");
    await client.close();
  }
};

initializeDbAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, process.env.JWT_SECRET_KEY, async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

const addUserDetails = async (userDetails, client) => {
  const result = await client
    .db("knock-knock")
    .collection("userdetails")
    .insertOne(userDetails);
};

const apiServices = (client) => {
  app.get("/", async (request, response) => {
    response.status(200);
    response.send("Welcome to FashionFit server,Enjoy our Services");
  });
  app.post("/register/", async (request, response) => {
    const { username, password, name, mailId } = request.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    let result = await client
      .db("knock-knock")
      .collection("userdetails")
      .find({ username: username });
    result = await result.toArray();
    if (result.length === 0) {
      const createUser = await addUserDetails(
        {
          username: username,
          password: hashedPassword,
          name: name,
          mailId: mailId,
        },
        client
      );
      response.send("User Created Successfully");
      let toMail = mailId;
      let text = `You have successfully registered with the username: ${username} in FashionFit Organization`;
      let subject = "Successful Registration";

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.fromMail,
          pass: process.env.fromMailPassword,
        },
      });
      let mailOptions = {
        from: process.env.fromMail,
        to: toMail,
        subject: subject,
        text: text,
      };
      await transporter.sendMail(mailOptions, (error, response) => {
        if (error) {
          console.log(error, "creation failed");
        }
        console.log(response, "creation passed");
      });
    } else {
      response.send("User Already Exists");
    }
  });

  app.post("/login/", async (request, response) => {
    const { username, password } = request.body;

    let result1 = await client
      .db("knock-knock")
      .collection("userdetails")
      .find({ username: username });
    result1 = await result1.toArray();
    if (result1.length === 0) {
      response.status(400);
      response.send({ error_msg: "Invalid User" });
    } else {
      const isPasswordMatched = await bcrypt.compare(
        password,
        result1[0].password
      );
      if (isPasswordMatched == true) {
        const payload = {
          username: username,
        };
        const jwtToken = jwt.sign(payload, process.env.JWT_SECRET_KEY);
        response.send({ jwt_token: jwtToken });
      } else {
        response.status(400);
        response.send({ error_msg: "Invalid Password" });
      }
    }
  });
  app.get("/userDetails/:username/", async (request, response) => {
    const { username } = request.params;
    let result = await client
      .db("knock-knock")
      .collection("userdetails")
      .find({ username: username });
    result = await result.toArray();
    response.status(200);
    response.send(result);
  });
  app.get("/products/", authenticateToken, async (request, response) => {
    const {
      sort_by,
      category = 0,
      title_search = "",
      rating = "0",
    } = request.query;
    let order;
    if (sort_by === "PRICE_HIGH") {
      order = -1;
    } else {
      order = 1;
    }
    let regex = new RegExp(`${title_search}`, "i");
    let regex2 = new RegExp(categories[parseInt(category)], "i");
    const object = {
      title: { $regex: regex },
      rating: { $gte: rating },
      image_url: { $regex: regex2 },
    };
    let result = await client
      .db("knock-knock")
      .collection("products")
      .find(object)
      .sort({ price: order });

    result = await result.toArray();
    response.status(200);
    response.send({
      products: result,
      total: result.length,
    });
  });
  app.get("/products/:id", authenticateToken, async (request, response) => {
    const { id } = request.params;
    let result = await client
      .db("knock-knock")
      .collection("eachProductDetails")
      .find({ id: parseInt(id) });
    result = await result.toArray();

    response.status(200);
    response.send(result[0]);
  });
  app.post("/products/:id", async (request, response) => {
    const { id } = request.params;
    const data = request.body;
    let result = await client
      .db("knock-knock")
      .collection("eachProductDetails")
      .insertOne(data);
  });
  app.post("/otp", async (request, response) => {
    const { mailId } = request.body;
    let toMail = mailId;
    let random = parseInt(generateOTP());
    let text = `${random} is your FashionFit verification OTP.Please do not share with anyone`;
    let subject = "FashionFit Verification";
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.fromMail,
        pass: process.env.fromMailPassword,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
    let mailOptions = {
      from: process.env.fromMail,
      to: toMail,
      subject: subject,
      text: text,
    };
    await transporter.sendMail(mailOptions, (error, response) => {
      if (error) {
        console.log(error);
      } else {
        console.log(response);
      }
    });
    response.status(200);
    response.send({ otp: random });
  });
  app.get("/userDetails/mails/:mailId", async (request, response) => {
    const { mailId } = request.params;
    let result = await client
      .db("knock-knock")
      .collection("userdetails")
      .find({ mailId: mailId });
    result = await result.toArray();
    response.status(200);
    response.send(result);
  });
};
module.exports = app;
