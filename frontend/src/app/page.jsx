"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  Link2Icon,
  UploadIcon,
} from "lucide-react";

async function parseApiResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    if (!response.ok) {
      throw new Error(
        "API returned non-JSON response. Check frontend proxy and backend server.",
      );
    }
    throw new Error("Unexpected non-JSON response from API.");
  }
}

export default function Home() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [files, setFiles] = useState([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [copiedFileName, setCopiedFileName] = useState("");
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef(null);

  const withErrorHandling = async (action) => {
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err.message || "Request failed");
      setStatus("");
    }
  };

  const loadProjects = async () => {
    setLoadingProjects(true);
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(data.error || "Failed to load projects");
      }
      const nextProjects = data.projects || [];
      setProjects(nextProjects);
      if (selectedProject && !nextProjects.includes(selectedProject)) {
        setSelectedProject("");
      }
    } finally {
      setLoadingProjects(false);
    }
  };

  const loadFiles = async (projectName) => {
    if (!projectName) {
      setFiles([]);
      return;
    }

    setLoadingFiles(true);
    try {
      const response = await fetch(`/api/projects/${projectName}/files`, {
        cache: "no-store",
      });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(data.error || "Failed to load files");
      }
      setFiles(Array.isArray(data) ? data : []);
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    withErrorHandling(async () => {
      await loadProjects();
    });
  }, []);

  useEffect(() => {
    withErrorHandling(async () => {
      await loadFiles(selectedProject);
    });
  }, [selectedProject]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(event.target)) {
        setIsProjectMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const createProject = async (event) => {
    event.preventDefault();
    const projectName = newProjectName.trim();
    if (!projectName) {
      setError("Project name is required");
      return;
    }

    await withErrorHandling(async () => {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName }),
      });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(data.error || "Failed to create project");
      }

      setStatus(data.created ? "Project created" : "Project already exists");
      setNewProjectName("");
      await loadProjects();
      setSelectedProject(projectName.toLowerCase());
    });
  };

  const uploadFile = async (event) => {
    event.preventDefault();
    if (!selectedProject) {
      setError("Select a project first");
      return;
    }

    if (!selectedFile) {
      setError("Choose a file to upload");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    await withErrorHandling(async () => {
      const response = await fetch(`/api/projects/${selectedProject}/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(data.error || "Failed to upload file");
      }

      setStatus(`Uploaded: ${data.fileName}`);
      setSelectedFile(null);
      const input = document.getElementById("file-input");
      if (input) {
        input.value = "";
      }
      await loadFiles(selectedProject);
    });
  };

  const deleteFile = async (fileName) => {
    if (!selectedProject) {
      return;
    }
    const confirmed = window.confirm(`Delete ${fileName}?`);
    if (!confirmed) {
      return;
    }

    await withErrorHandling(async () => {
      const response = await fetch(`/api/projects/${selectedProject}/files`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName }),
      });
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete file");
      }

      setStatus(data.message || "File deleted");
      await loadFiles(selectedProject);
    });
  };

  const copyFileLink = async (file) => {
    try {
      await navigator.clipboard.writeText(file.url);
      setCopiedFileName(file.name);
      setTimeout(() => {
        setCopiedFileName("");
      }, 1500);
    } catch {
      setError("Failed to copy link");
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 md:px-8">
      <section className="rounded-2xl border border-slate-200 bg-white/95 p-7 shadow-lg shadow-slate-200/60">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          GitHub Image Bucket
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          A clean dashboard to manage projects and image files.
        </p>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-slate-100">
            <h2 className="text-base font-semibold text-slate-900">
              Create Project
            </h2>
            <form onSubmit={createProject} className="mt-3 space-y-3">
              <input
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                placeholder="example: abcd-app"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-500"
              />
              <button
                className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                type="submit"
              >
                Create Project
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-slate-100">
            <h2 className="text-base font-semibold text-slate-900">Project</h2>
            <div className="mt-3 space-y-3">
              <div className="relative" ref={projectMenuRef}>
                <button
                  id="project-select"
                  type="button"
                  onClick={() => setIsProjectMenuOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition hover:border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  aria-haspopup="listbox"
                  aria-expanded={isProjectMenuOpen}
                >
                  <span className="truncate">
                    {selectedProject || "Select project"}
                  </span>
                  <ChevronDownIcon
                    className={`h-4 w-4 text-indigo-500 transition-transform ${isProjectMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isProjectMenuOpen ? (
                  <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-indigo-100 bg-white shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProject("");
                        setIsProjectMenuOpen(false);
                      }}
                      className="block w-full px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-indigo-50"
                    >
                      Select project
                    </button>
                    {projects.map((project) => (
                      <button
                        key={project}
                        type="button"
                        onClick={() => {
                          setSelectedProject(project);
                          setIsProjectMenuOpen(false);
                        }}
                        className={`block w-full px-3 py-2.5 text-left text-sm transition hover:bg-indigo-50 ${selectedProject === project ? "bg-indigo-50 text-indigo-700" : "text-slate-700"}`}
                      >
                        {project}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => withErrorHandling(loadProjects)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                {loadingProjects ? "Refreshing..." : "Refresh Projects"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-slate-100">
            <h2 className="text-base font-semibold text-slate-900">Upload</h2>
            <form onSubmit={uploadFile} className="mt-3 space-y-3">
              <label
                htmlFor="file-input"
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
              >
                <UploadIcon className="h-4 w-4" />
                <span className="truncate">
                  {selectedFile ? selectedFile.name : "Choose an image file"}
                </span>
              </label>
              <input
                id="file-input"
                type="file"
                accept="image/*"
                onChange={(event) =>
                  setSelectedFile(event.target.files?.[0] || null)
                }
                className="hidden"
              />
              {selectedFile ? (
                <p className="text-xs text-slate-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              ) : null}
              <button
                className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                type="submit"
                disabled={!selectedProject}
              >
                Upload File
              </button>
            </form>
          </div>
        </div>

        {selectedProject ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md shadow-slate-100">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Files</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {selectedProject}
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                      Image
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                      Link
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {files.length === 0 ? (
                    <tr>
                      <td
                        className="px-3 py-4 text-sm text-slate-500"
                        colSpan={3}
                      >
                        {loadingFiles ? "Loading files..." : "No files found"}
                      </td>
                    </tr>
                  ) : (
                    files.map((file) => (
                      <tr
                        key={file.name}
                        className="odd:bg-white even:bg-slate-50/40"
                      >
                        <td className="border-b border-slate-100 px-3 py-2">
                          <div className="flex items-center gap-3">
                            <img
                              src={file.url}
                              alt={file.name}
                              loading="lazy"
                              className="h-12 w-12 rounded-md border border-slate-200 object-cover bg-slate-100"
                            />
                            <span
                              className="max-w-55 truncate text-sm font-medium text-slate-800"
                              title={file.name}
                            >
                              {file.name}
                            </span>
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-sm">
                          <div className="flex items-center gap-2">
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                              aria-label={`Open ${file.name}`}
                              title={file.url}
                            >
                              <Link2Icon className="h-4 w-4" />
                            </a>
                            <button
                              type="button"
                              onClick={() => copyFileLink(file)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                              aria-label={`Copy link for ${file.name}`}
                              title="Copy link"
                            >
                              {copiedFileName === file.name ? (
                                <CheckIcon className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <CopyIcon className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2">
                          <button
                            type="button"
                            onClick={() => deleteFile(file.name)}
                            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 min-h-6">
              {status ? (
                <p className="text-sm font-medium text-emerald-700">{status}</p>
              ) : null}
              {error ? (
                <p className="text-sm font-medium text-red-700">{error}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-md shadow-slate-100">
            <div className="flex h-full min-h-72 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
              <p className="text-sm font-medium text-slate-600">Select a project first</p>
            </div>
            <div className="mt-4 min-h-6">
              {status ? (
                <p className="text-sm font-medium text-emerald-700">{status}</p>
              ) : null}
              {error ? (
                <p className="text-sm font-medium text-red-700">{error}</p>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
