var express = require("express");
var logger = require("morgan");
var mongoose = require("mongoose");
var exphbs = require('express-handlebars');

var path = require("path");

// Our scraping tools
// Axios is a promised-based http library, similar to jQuery's Ajax method
// It works on the client and on the server
var axios = require("axios");
var cheerio = require("cheerio");

// Require all models
var db = require("./models");
var Note = require("./models/Note.js");
var Article = require("./models/Article.js");


var PORT = 3000;

// Database configuration with mongoose

// const MongoClient = require(‘mongodb’).MongoClient;
// const uri = "mongodb+srv://rachaelbelle:Buster577%2A@cluster0-nyetd.mongodb.net/test?retryWrites=true&w=majority";
// const client = new MongoClient(uri, { useNewUrlParser: true });
// client.connect(err => {
//   const collection = client.db("test").collection("devices");
//   // perform actions on the collection object
//   client.close();
// });

// mongoose.connect("mongodb://heroku_jmv816f9:5j1nd4taq42hi29bfm5hobeujd@ds133192.mlab.com:33192/heroku_jmv816f9");
// //mongoose.connect("mongodb://localhost/mongoscraper");
// var db = mongoose.connection;

// Initialize Express
var app = express();

// Configure middleware

// Use morgan logger for logging requests
app.use(logger("dev"));
// Parse request body as JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Make public a static folder
app.use(express.static("public"));



app.engine("handlebars", exphbs({
  defaultLayout: "main",
  partialsDir: path.join(__dirname, "/views/layouts/partials")
}));
app.set("view engine", "handlebars");


// Routes

//GET requests to render Handlebars pages
app.get("/", function (req, res) {
  Article.find({ "saved": false }, function (error, data) {
    var hbsObject = {
      article: data
    };
    console.log(hbsObject);
    res.render("home", hbsObject);
  });
});

app.get("/saved", function (req, res) {
  Article.find({ "saved": true }).populate("notes").exec(function (error, articles) {
    var hbsObject = {
      article: articles
    };
    res.render("saved", hbsObject);
  });
});


// A GET request to scrape the NYTimes website
app.get("/scrape", function (req, res) {
  // First, we grab the body of the html with request
  axios.get("https://www.nytimes.com/").then(function(response){
    var $ = cheerio.load(response.data);
    $("article").each(function (i, element) {
     var result = {};
     result.title = $(element).find('h2.esl82me0').text();
      result.link= $(element).find('a').attr('href');
      result.description = $(element).find('p.e1n8kpyg0').text();
       db.Article.create(result).then(function(articles){
      console.log(articles)
       }).catch(function(err){
         return res.json(err)
       });
    })
    res.send('You are a hacker, you scraped the NYT')
  })

});

// })

// This will get the articles we scraped from the mongoDB
app.get("/articles", function (req, res) {

  db.Article.find({saved:false}).then(function(response){
    res.json(response)
  }).catch(function(err){
    res.json(err)
  })
});

// Grab an article by it's ObjectId
app.get("/articles/:id", function (req, res) {
  // Using the id passed in the id parameter, prepare a query that finds the matching one in our db...
  db.Article.findOne({ "_id": req.params.id })
    // ..and populate all of the notes associated with it
    .populate("note")
    // now, execute our query
    .exec(function (error, doc) {
      // Log any errors
      if (error) {
        console.log(error);
      }
      // Otherwise, send the doc to the browser as a json object
      else {
        res.json(doc);
      }
    });
});


// Save an article
app.post("/articles/save/:id", function (req, res) {
  // Use the article id to find and update its saved boolean
  db.Article.findOneAndUpdate({ "_id": req.params.id }, { "saved": true })
    // Execute the above query
    .exec(function (err, doc) {
      // Log any errors
      if (err) {
        console.log(err);
      }
      else {
        // Or send the document to the browser
        res.send(doc);
      }
    });
});

// Delete an article
app.post("/articles/delete/:id", function (req, res) {
  // Use the article id to find and update its saved boolean
  db.Article.findOneAndUpdate({ "_id": req.params.id }, { "saved": false, "notes": [] })
    // Execute the above query
    .exec(function (err, doc) {
      // Log any errors
      if (err) {
        console.log(err);
      }
      else {
        // Or send the document to the browser
        res.send(doc);
      }
    });
});


// Create a new note
app.post("/notes/save/:id", function (req, res) {
  // Create a new note and pass the req.body to the entry
  var newNote = new Note({
    body: req.body.text,
    article: req.params.id
  });
  console.log(req.body)
  // And save the new note the db
  newNote.save(function (error, note) {
    // Log any errors
    if (error) {
      console.log(error);
    }
    // Otherwise
    else {
      // Use the article id to find and update it's notes
      db.Article.findOneAndUpdate({ "_id": req.params.id }, { $push: { "notes": note } })
        // Execute the above query
        .exec(function (err) {
          // Log any errors
          if (err) {
            console.log(err);
            res.send(err);
          }
          else {
            // Or send the note to the browser
            res.send(note);
          }
        });
    }
  });
});

// Delete a note
app.delete("/notes/delete/:note_id/:article_id", function (req, res) {
  // Use the note id to find and delete it
  db.Note.findOneAndRemove({ "_id": req.params.note_id }, function (err) {
    // Log any errors
    if (err) {
      console.log(err);
      res.send(err);
    }
    else {
      db.Article.findOneAndUpdate({ "_id": req.params.article_id }, { $pull: { "notes": req.params.note_id } })
        // Execute the above query
        .exec(function (err) {
          // Log any errors
          if (err) {
            console.log(err);
            res.send(err);
          }
          else {
            // Or send the note to the browser
            res.send("Note Deleted");
          }
        });
    }
  });
});

// Connect to the Mongo DB
// mongoose.connect("mongodb://localhost/Papsmear-NewsScraper", { useNewUrlParser: true });


// // Connect to the Mongo DB
// var mongoURI = process.env.MONGODB_URI || "mongodb://localhost/scraperApp"
// mongoose.connect(mongoURI, { useNewUrlParser: true });


// If deployed, use the deployed database. Otherwise use the local mongoHeadlines database
// this isn't working..  grrr
var mongodb = process.env_URI || "mongodb://localhost/papsmear-NewsScrapermongodb://user:password1@ds263146.mlab.com:63146/heroku_kqt43qmg";

// mongoose.connect(MONGODB_URI, { useNewUrlParser: true });


mongoose.connect(mongodb, { useNewUrlParser: true }, function(error) {
  if (error) {
    console.log(error)
  } else {
    console.log("mongoose connection successful");
  }
});
Collapse





// Start the server
app.listen(PORT, function () {
  console.log("App running on port " + PORT + "!");
});
