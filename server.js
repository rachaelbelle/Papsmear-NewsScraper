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

// If deployed, use the deployed database. Otherwise use the local mongoHeadlines database
// this isn't working..  grrr
var MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/papsmear-NewsScraper";

mongoose.connect(MONGODB_URI);

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

// Connect to the Mongo DB
mongoose.connect("mongodb://localhost/Papsmear-NewsScraper", { useNewUrlParser: true });

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


// A GET request to scrape the echojs website
app.get("/scrape", function (req, res) {
  // First, we grab the body of the html with request
  request("https://www.nytimes.com/", function (error, response, html) {
    // Then, we load that into cheerio and save it to $ for a shorthand selector
    var $ = cheerio.load(html);
    // Now, we grab every h2 within an article tag, and do the following:
    $("article").each(function (i, element) {

      // Save an empty result object
      var result = {};

      // Add the title and summary of every link, and save them as properties of the result object

      summary = ""
      if ($(this).find("ul").length) {
        summary = $(this).find("li").first().text();
      } else {
        summary = $(this).find("p").text();
      };

      result.title = $(this).find("h2").text();
      result.summary = summary;
      result.link = "https://www.nytimes.com" + $(this).find("a").attr("href");

      // Using our Article model, create a new entry
      // This effectively passes the result object to the entry (and the title and link)
      var entry = new Article(result);

      // Now, save that entry to the db
      entry.save(function (err, doc) {
        // Log any errors
        if (err) {
          console.log(err);
        }
        // Or log the doc
        else {
          console.log(doc);
        }
      });

    });
    // Tell the browser that we finished scraping the text
    res.send("Scrape Complete");

  });
});

// This will get the articles we scraped from the mongoDB
app.get("/articles", function (req, res) {
  // Grab every doc in the Articles array
  Article.find({}, function (error, doc) {
    // Log any errors
    if (error) {
      console.log(error);
    }
    // Or send the doc to the browser as a json object
    else {
      res.json(doc);
    }
  });
});

// Grab an article by it's ObjectId
app.get("/articles/:id", function (req, res) {
  // Using the id passed in the id parameter, prepare a query that finds the matching one in our db...
  Article.findOne({ "_id": req.params.id })
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
  Article.findOneAndUpdate({ "_id": req.params.id }, { "saved": true })
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
  Article.findOneAndUpdate({ "_id": req.params.id }, { "saved": false, "notes": [] })
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
      Article.findOneAndUpdate({ "_id": req.params.id }, { $push: { "notes": note } })
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
  Note.findOneAndRemove({ "_id": req.params.note_id }, function (err) {
    // Log any errors
    if (err) {
      console.log(err);
      res.send(err);
    }
    else {
      Article.findOneAndUpdate({ "_id": req.params.article_id }, { $pull: { "notes": req.params.note_id } })
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




// Start the server
app.listen(PORT, function () {
  console.log("App running on port " + PORT + "!");
});
