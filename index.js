const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: "upload_tmp/" });

const GITHUB_API_BASE = "https://api.github.com";
const {
  GITHUB_TOKEN,
  GITHUB_REPO,
  GITHUB_BRANCH = "main",
  API_KEY,
} = process.env;

const requiredEnv = ["GITHUB_TOKEN", "GITHUB_REPO", "API_KEY"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  throw new Error(`Missing required env vars: ${missingEnv.join(", ")}`);
}

const githubHeaders = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
};

const rawBaseUrl = (filePath) =>
  `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${filePath}`;

const sanitizeProjectName = (name = "") => {
  const normalized = String(name).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-_]{1,62}$/.test(normalized)) {
    return null;
  }
  return normalized;
};

const projectPath = (projectName) => `uploads/${projectName}`;

const githubContentUrl = (repoPath) =>
  `${GITHUB_API_BASE}/repos/${GITHUB_REPO}/contents/${repoPath}`;

const readFileAsBase64 = (filePath) =>
  fs.readFileSync(filePath, { encoding: "base64" });

const deleteLocalFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const normalizeAxiosError = (error) => {
  const status = error.response?.status;
  const message =
    error.response?.data?.message || error.message || "Unexpected GitHub API error";
  return { status, message };
};

const getProjectPlaceholderSha = async (projectName) => {
  const placeholderPath = `${projectPath(projectName)}/_placeholder.txt`;
  const response = await axios.get(githubContentUrl(placeholderPath), {
    headers: githubHeaders,
    params: { ref: GITHUB_BRANCH },
  });
  return response.data.sha;
};

const ensureProjectExists = async (projectName) => {
  const placeholderPath = `${projectPath(projectName)}/_placeholder.txt`;
  try {
    await axios.get(githubContentUrl(placeholderPath), {
      headers: githubHeaders,
      params: { ref: GITHUB_BRANCH },
    });
    return { created: false };
  } catch (error) {
    const status = error.response?.status;
    if (status !== 404) {
      throw error;
    }

    const content = Buffer.from(
      `Project: ${projectName}\nCreated: ${new Date().toISOString()}\n`,
      "utf8"
    ).toString("base64");

    await axios.put(
      githubContentUrl(placeholderPath),
      {
        message: `Create project folder ${projectName}`,
        content,
        branch: GITHUB_BRANCH,
      },
      { headers: githubHeaders }
    );

    return { created: true };
  }
};

const listProjects = async () => {
  try {
    const response = await axios.get(githubContentUrl("uploads"), {
      headers: githubHeaders,
      params: { ref: GITHUB_BRANCH },
    });

    return response.data
      .filter((item) => item.type === "dir")
      .map((item) => item.name)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (error.response?.status === 404) {
      return [];
    }
    throw error;
  }
};

const getGithubFileSha = async (projectName, fileName) => {
  const githubFilePath = `${projectPath(projectName)}/${fileName}`;
  const response = await axios.get(githubContentUrl(githubFilePath), {
    headers: githubHeaders,
    params: { ref: GITHUB_BRANCH },
  });
  return response.data.sha;
};

const getGithubFileShaIfExists = async (projectName, fileName) => {
  try {
    return await getGithubFileSha(projectName, fileName);
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
};

const uploadFileToGithub = async (projectName, file, content) => {
  const githubFilePath = `${projectPath(projectName)}/${file.originalname}`;
  const existingSha = await getGithubFileShaIfExists(projectName, file.originalname);

  const payload = {
    message: `Upload ${file.originalname} to ${projectName}`,
    content,
    branch: GITHUB_BRANCH,
  };

  if (existingSha) {
    payload.sha = existingSha;
  }

  await axios.put(
    githubContentUrl(githubFilePath),
    payload,
    { headers: githubHeaders }
  );

  return rawBaseUrl(githubFilePath);
};

const deleteFileFromGithub = async (projectName, fileName, sha) => {
  const githubFilePath = `${projectPath(projectName)}/${fileName}`;
  await axios.delete(githubContentUrl(githubFilePath), {
    headers: githubHeaders,
    data: {
      message: `Delete ${fileName} from ${projectName}`,
      branch: GITHUB_BRANCH,
      sha,
    },
  });
};

const verifyApiKey = (req, res, next) => {
  const incomingApiKey = req.header("x-api-key") || req.query["x-api-key"];

  if (!incomingApiKey) {
    return res.status(401).json({ error: "x-api-key is required" });
  }

  if (incomingApiKey !== API_KEY) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  next();
};

app.use(verifyApiKey);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/projects", async (req, res) => {
  const projectName = sanitizeProjectName(req.body.projectName);
  if (!projectName) {
    return res.status(400).json({
      error:
        "Invalid projectName. Use 2-63 chars: lowercase letters, numbers, '-' or '_'",
    });
  }

  try {
    const result = await ensureProjectExists(projectName);
    return res.status(result.created ? 201 : 200).json({
      projectName,
      created: result.created,
      placeholder: rawBaseUrl(`${projectPath(projectName)}/_placeholder.txt`),
    });
  } catch (error) {
    console.error("Create project error:", normalizeAxiosError(error));
    return res.status(500).json({ error: "Failed to create project" });
  }
});

app.get("/projects", async (req, res) => {
  try {
    const projects = await listProjects();
    return res.json({ projects });
  } catch (error) {
    console.error("List projects error:", normalizeAxiosError(error));
    return res.status(500).json({ error: "Failed to retrieve projects" });
  }
});

app.post("/projects/:projectName/upload", upload.single("file"), async (req, res) => {
  const projectName = sanitizeProjectName(req.params.projectName);
  if (!projectName) {
    deleteLocalFile(req.file?.path);
    return res.status(400).json({ error: "Invalid project name" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "File is required under key 'file'" });
  }

  const filePath = path.resolve(req.file.path);

  try {
    await ensureProjectExists(projectName);
    const content = readFileAsBase64(filePath);
    const publicUrl = await uploadFileToGithub(projectName, req.file, content);
    return res.json({ publicUrl, projectName, fileName: req.file.originalname });
  } catch (error) {
    console.error("Upload error:", normalizeAxiosError(error));
    return res.status(500).json({ error: "Failed to upload the file" });
  } finally {
    deleteLocalFile(filePath);
  }
});

app.get("/projects/:projectName/files", async (req, res) => {
  const projectName = sanitizeProjectName(req.params.projectName);
  if (!projectName) {
    return res.status(400).json({ error: "Invalid project name" });
  }

  try {
    const response = await axios.get(githubContentUrl(projectPath(projectName)), {
      headers: githubHeaders,
      params: { ref: GITHUB_BRANCH },
    });

    const files = response.data
      .filter((item) => item.type === "file" && item.name !== "_placeholder.txt")
      .map((item) => ({
        name: item.name,
        url: rawBaseUrl(`${projectPath(projectName)}/${item.name}`),
      }));

    return res.json(files);
  } catch (error) {
    const status = error.response?.status;
    if (status === 404) {
      return res.status(404).json({ error: "Project not found" });
    }

    console.error("List files error:", normalizeAxiosError(error));
    return res.status(500).json({ error: "Failed to retrieve files" });
  }
});

app.delete("/projects/:projectName/files", async (req, res) => {
  const projectName = sanitizeProjectName(req.params.projectName);
  const fileName = req.body.fileName;

  if (!projectName) {
    return res.status(400).json({ error: "Invalid project name" });
  }

  if (!fileName) {
    return res.status(400).json({ error: "fileName is required" });
  }

  if (fileName === "_placeholder.txt") {
    return res.status(400).json({ error: "Cannot delete placeholder file" });
  }

  try {
    const sha = await getGithubFileSha(projectName, fileName);
    await deleteFileFromGithub(projectName, fileName, sha);
    return res.json({ message: `File \"${fileName}\" deleted successfully` });
  } catch (error) {
    const status = error.response?.status;
    if (status === 404) {
      return res.status(404).json({ error: "File or project not found" });
    }

    console.error("Delete file error:", normalizeAxiosError(error));
    return res.status(500).json({ error: "Failed to delete the file" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
