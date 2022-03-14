const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const multer = require("multer");
const { exec } = require("child_process");
const glob = require("glob");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffmpeg = require("fluent-ffmpeg");
ffmpeg.setFfmpegPath(ffmpegPath);

let list = "";

const listFilePath = "public/uploads/" + Date.now() + "list.txt";

const outputFileName = Date.now() + "output.mp4";

const app = express();

const dir = "public";
const subDirectory = "public/uploads";

if (!fs.existsSync(dir) || !fs.existsSync(subDirectory)) {
  fs.mkdirSync(dir);

  fs.mkdirSync(subDirectory);
  fs.mkdirSync("public/trimuploads");
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads");
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    );
  },
});

const videoFilter = function (req, file, cb) {
  // Accept videos only
  if (!file.originalname.toLowerCase().match(/\.(mp4|mov)$/)) {
    req.fileValidationError = "Only video files are allowed!";
    return cb(new Error("Only video files are allowed!"), false);
  }
  cb(null, true);
};

var upload = multer({ storage: storage, fileFilter: videoFilter });
var uploadAnyfile = multer({ storage: storage });
var uploadToTrim = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "public/trimuploads");
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname);
    },
  }),
  fileFilter: videoFilter,
});

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
console.log("__dirname", __dirname);
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/src/index.html");
});

app.post("/merge", upload.array("files", 1000), async (req, res) => {
  if (!req.files) {
    res.send(400).json({ message: "No files found!" });
    return;
  }
  list = "";

  req.files.forEach((file) => {
    list += `file ${file.filename}`;
    list += "\n";
  });

  let writeStream = fs.createWriteStream(listFilePath);
  writeStream.write(list);
  writeStream.end();

  exec(
    `ffmpeg -safe 0 -f concat -i ${listFilePath} -c copy ${outputFileName}`,
    (error) => {
      if (error) {
        console.log(`error: ${error.message}`);
        req.files.forEach((file) => {
          fs.unlinkSync(file.path);
        });

        fs.unlinkSync(listFilePath);
        fs.unlinkSync(outputFileName);
        return;
      } else {
        console.log("videos are successfully merged");

        res
          .status(200)
          .sendFile(
            path.join(__dirname + `/${outputFileName}`),
            function (err) {
              if (err) throw err;
              req.files.forEach((file) => {
                fs.unlinkSync(file.path);
              });

              fs.unlinkSync(listFilePath);
              fs.unlinkSync(outputFileName);
            }
          );
      }
    }
  );
});

app.post("/trim", uploadToTrim.array("files", 0), (req, res) => {
  const videos = glob.sync("public/trimuploads/*.mp4");
  if (videos.length === 0 || !req.body.starttime || !req.body.duration) {
    res.send(400).json({ message: "No time found!" });
    return;
  }

  ffmpeg(videos[0])
    .setStartTime(req.body.starttime)
    .setDuration(parseInt(req.body.duration))
    .output(outputFileName)
    .on("end", function (err) {
      if (!err) {
        console.log("video is trimmed successfully");

        res
          .status(200)
          .sendFile(
            path.join(__dirname + `/${outputFileName}`),
            function (err) {
              if (err) throw err;

              fs.unlinkSync(outputFileName);
            }
          );
      }
    })
    .on("error", function (err) {
      console.log("error: ", err);
    })
    .run();
});

app.post("/addCaptions", uploadAnyfile.array("files", 2), (req, res) => {
  if (!req.files) {
    res.send(400).json({ message: "No files found!" });
    return;
  }

  const videos = glob.sync("public/uploads/*.mp4");
  const srts = glob.sync("public/uploads/*.srt");
  console.log({ videos, srts });

  ffmpeg(videos[0])
    .outputOptions("-vf subtitles=" + srts[0])
    .on("error", function (err) {
      console.log("Error: " + err.message);
    })
    .save(outputFileName)
    .on("end", function (err) {
      if (!err) {
        console.log("caption added successfully");

        res
          .status(200)
          .sendFile(
            path.join(__dirname + `/${outputFileName}`),
            function (err) {
              if (err) throw err;
              req.files.forEach((file) => {
                fs.unlinkSync(file.path);
              });

              fs.unlinkSync(outputFileName);
            }
          );
      }
    });
});

app.post("/allThumbnails", uploadToTrim.array("files", 1), (req, res) => {
  if (!req.files) {
    res.send(400).json({ message: "No files found!" });
    return;
  }
  const videos = glob.sync("public/trimuploads/*.mp4");

  ffmpeg(videos[0])
    .screenshots({
      timestamps: [
        "1%",
        "15%",
        "25%",
        "35%",
        "50%",
        "60%",
        "70%",
        "80%",
        "90%",
        "99%",
      ],
      filename: "thumbnail-at-%s-seconds.png",
      folder: "public/thumbs/",
      size: "320x240",
    })
    .on("end", function (err) {
      if (!err) {
        console.log("Screenshots taken");
        const images = glob.sync("public/thumbs/*.png");

        res.status(200).send({ paths: images });
        // req.files.forEach((file) => {
        //   fs.unlinkSync(file.path);
        // });
        // fs.readdir("public/thumbs", (err, files) => {
        //   if (err) console.log(err);
        //   files.forEach((file) => {
        //     fs.unlinkSync(path.join("public/thumbs", file));
        //   });
        // });
      }
    });
});

app.post("/thumbnail", uploadToTrim.array("files", 0), (req, res) => {
  const videos = glob.sync("public/trimuploads/*.mp4");
  if (videos.length === 0 || !req.body.time) {
    res.send(400).json({ message: "No time found!" });
    return;
  }

  ffmpeg(videos[0])
    .screenshots({
      timestamps: [req.body.time],
      filename: "thumbnail-at-%s-seconds.png",
      folder: "public/selectedthumb/",
      size: "320x240",
    })
    .on("end", function (err) {
      if (!err) {
        console.log("Screenshot taken");
        const [hours, minutes, seconds] = req.body.time.split(":");
        const totalSeconds = +hours * 60 * 60 + +minutes * 60 + +seconds;

        res.send({
          path: `public/selectedthumb/thumbnail-at-${totalSeconds}-seconds.png`,
        });
      }
    });
});

app.post("/addOverlay", upload.array("files", 1000), (req, res) => {
  if (!req.files || !req.body.text || !req.body.offsetX || !req.body.offsetY) {
    res.send(400).json({ message: "No data found!" });
    return;
  }
  console.log(req.files)
  const videos = glob.sync("public/uploads/*.**4");
  console.log(videos)

  ffmpeg(videos[0])
    .videoFilters({
      filter: 'drawtext',
      options: {
        fontfile: path.join(__dirname + `/fonts/Roboto-Regular.ttf'`),
        text: req.body.text,
        fontsize: 40,
        fontcolor: 'black',
        x: req.body.offsetX,
        y: req.body.offsetY,
        // shadowcolor: 'black',
        // shadowx: 2,
        // shadowy: 2,
        boxcolor: "white@0.7",
        box: 1,
        boxborderw: 5,
      }
    })
    .on("error", function (err, stdout, stderr) {
      console.log("Error: " + stderr);
      req.files.forEach((file) => {
        fs.unlinkSync(file.path);
      });
      fs.unlinkSync(outputFileName);
    })
    .save(outputFileName)
    .on("end", function (err) {
      if (!err) {
        console.log("text added successfully");

        res
          .status(200)
          .sendFile(
            path.join(__dirname + `/${outputFileName}`),
            function (err) {
              if (err) throw err;
              req.files.forEach((file) => {
                fs.unlinkSync(file.path);
              });

              fs.unlinkSync(outputFileName);
            }
          );
      }
    });
});

app.listen(PORT, () => {
  console.log(`App is listening on Port ${PORT}`);
});
