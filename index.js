const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const bodyParser = require("body-parser");
const multer = require("multer");

let list = "";

const listFilePath = "public/uploads/" + Date.now() + "list.txt";

const outputFileName = Date.now() + "output.mp4";

const app = express();

const dir = "public";
const subDirectory = "public/uploads";

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);

  fs.mkdirSync(subDirectory);
}
const currentTime = Date.now();
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads");
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname + "-" + currentTime + path.extname(file.originalname)
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

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
console.log("__dirname", __dirname);
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/src/index.html");
});

app.post("/merge", upload.array("files", 1000), (req, res) => {
  if (!req.files) {
    res.send(400).json({ message: "No files found!" });
    return;
  }
  list = "";
  req.files.forEach((file) => {
    list += `file ${file.filename}`;
    list += "\n";
  });

  var writeStream = fs.createWriteStream(listFilePath);

  writeStream.write(list);

  writeStream.end();

  exec(
    `ffmpeg -safe 0 -f concat -i ${listFilePath} -c copy ${outputFileName}`,
    (error, stdout, stderr) => {
      if (error) {
        console.log(`error: ${error.message}`);
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

app.post("/trim", upload.array("files", 1), (req, res) => {
  if (!req.files) {
    res.send(400).json({ message: "No files found!" });
    return;
  }

  const file = req.files[0];

  const fileName =
    file.fieldname + "-" + currentTime + path.extname(file.originalname);

  exec(
    // `ffmpeg -ss 00:00:02 -to 00:00:10 -i ${subDirectory}/${fileName} -c copy ${outputFileName}`,
    `ffmpeg -i ${subDirectory}/${fileName} \
    -vf "select='between(t,2,3.5)+between(t,5,6)',
         setpts=N/FRAME_RATE/TB" \
    -af "aselect='between(t,2,3.5)+between(t,5,8)',
         asetpts=N/SR/TB" ${outputFileName}`,
    (error, stdout, stderr) => {
      if (error) {
        console.log(`error: ${error.message}`);
        return;
      } else {
        console.log("video is trimmed successfully");

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
    }
  );
});

app.post("/thumbnail", upload.array("files", 1), (req, res) => {
  
})

app.listen(PORT, () => {
  console.log(`App is listening on Port ${PORT}`);
});
