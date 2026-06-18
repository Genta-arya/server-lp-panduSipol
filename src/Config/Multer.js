import multer from "multer";
import path from "path";
import fs from "fs";

const __dirname = path.resolve();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "Public/Images");

   
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
  
    const fileNameWithoutSpaces = file.originalname.replace(/\s+/g, "-");
    cb(null, Date.now() + "-" + fileNameWithoutSpaces);
  },
});

const fileFilter = (req, file, cb) => {
  const fileTypes = /jpeg|jpg|png|gif/; 
  const mimeType = fileTypes.test(file.mimetype);

  if (mimeType) {
    return cb(null, true);
  } else {
    cb(new Error("Hanya gambar yang diperbolehkan!"), false);
  }
};


export const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, 
  fileFilter: fileFilter,
});


export const uploadImage = upload.single("image");


export const uploadImages = upload.array("images", 3);
