import {
  ActionPanel,
  Form,
  getSelectedText,
  Action,
  open,
  showToast,
  Toast,
  showHUD,
  Color,
  Icon,
  LocalStorage,
  popToRoot,
  closeMainWindow,
  List,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { runAppleScript } from "@raycast/utils";
import { GET_ACTIVE_APP_SCRIPT, GET_LINK_FROM_BROWSER_SCRIPT, SUPPORTED_BROWSERS } from "./scripts/browser";
import { useObsidianVaults, vaultPluginCheck } from "./utils/utils";
import { NoVaultFoundMessage } from "./components/Notifications/NoVaultFoundMessage";
import AdvancedURIPluginNotInstalled from "./components/Notifications/AdvancedURIPluginNotInstalled";

import * as fs from "fs";
import path from "path";

import { Vault } from "./utils/interfaces";

function validFile(file: string, includes: string[]) {
  for (const include of includes) {
    if (file.includes(include)) {
      return false;
    }
  }
  return true;
}

function validFileEnding(file: string, fileEndings: string[]) {
  for (const ending of fileEndings) {
    if (file.endsWith(ending)) {
      return true;
    }
  }
  return false;
}

function validFolder(folder: string, exFolders: string[]) {
  for (let f of exFolders) {
    if (f.endsWith("/")) {
      f = f.slice(0, -1);
    }
    if (folder.includes(f)) {
      return false;
    }
  }
  return true;
}

function walkFilesHelper(dirPath: string, exFolders: string[], fileEndings: string[], arrayOfFiles: string[]) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  for (const file of files) {
    const next = fs.statSync(dirPath + "/" + file);
    if (next.isDirectory() && validFile(file, [".git", ".obsidian", ".trash", ".excalidraw", ".mobile"])) {
      arrayOfFiles = walkFilesHelper(dirPath + "/" + file, exFolders, fileEndings, arrayOfFiles);
    } else {
      if (
        validFileEnding(file, fileEndings) &&
        file !== ".md" &&
        !file.includes(".excalidraw") &&
        !dirPath.includes(".obsidian") &&
        validFolder(dirPath, exFolders)
      ) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  }

  return arrayOfFiles;
}

function findRightVault(vaultName: string, vaultsWithPlugin: Vault[]) {
  for (let vault of vaultsWithPlugin) {
    if (vaultName == vault.name) {
      return vault.path;
    }
  }
  return "";
}

function findFilePathInVault(allFilesWithPath: string[], fileName: string) {
  for (let filePath of allFilesWithPath) {
    let splitArray = filePath.split("/");
    if (splitArray.includes(fileName)) {
      return filePath;
    }
  }
  return "";
}

function extractLocalPath(filePath: string, vault: string, fileName: string) {
  let splitArray = filePath.split(vault);
  //console.log(splitArray);
  let relPathComp = splitArray[1];
  //console.log(relPathComp.split(fileName));
  let localPath = relPathComp.split(fileName)[0];
  localPath = localPath.substring(1, localPath.length - 1);
  return localPath;
}

export default function Capture() {
  const { ready, vaults: allVaults } = useObsidianVaults();
  const [vaultsWithPlugin] = vaultPluginCheck(allVaults, "obsidian-advanced-uri");

  const [defaultVault, setDefaultVault] = useState<string | undefined>(undefined);
  const [defaultPath, setDefaultPath] = useState<string | undefined>(undefined);

  LocalStorage.getItem("vault").then((savedVault) => {
    if (savedVault) setDefaultVault(savedVault.toString());
  });

  LocalStorage.getItem("path").then((savedPath) => {
    if (savedPath) setDefaultPath(savedPath.toString());
    else setDefaultPath("inbox");
  });
  const formatData = (content?: string, link?: string, highlight?: string) => {
    const data = [];
    if (content) {
      data.push(content);
    }
    if (link) {
      data.push(`[${resourceInfo}](${link})`);
    }
    if (highlight) {
      data.push(`> ${selectedText}`);
    }
    return data.join("\n\n");
  };

  async function createNewNote({ fileName, content, link, vault, path, highlight }: Form.Values) {
    const vaultPath = findRightVault(vault, vaultsWithPlugin);

    const allFiles = walkFilesHelper(vaultPath, [], [".md"], []);

    let filePath = findFilePathInVault(allFiles, fileName + ".md");
    let fileExists = false;

    if (filePath != "") {
      console.log("This file exists!");
      fileExists = true;
      //update file path to the duplicate path
      path = extractLocalPath(filePath, vault, fileName);
      console.log(path);
    } else {
      console.log("This file does not exist!");
    }

    // Save vault and path to local storage
    await LocalStorage.setItem("vault", vault);
    await LocalStorage.setItem("path", path);

    let target = "";
    if (!fileExists) {
      target = `obsidian://advanced-uri?vault=${encodeURIComponent(vault)}&filepath=${encodeURIComponent(
        path
      )}/${encodeURIComponent(fileName)}&data=${encodeURIComponent(formatData(content, link, highlight))}`;
    } else {
      content = "#### New Thought\n" + content;
      target = `obsidian://advanced-uri?vault=${encodeURIComponent(vault)}&filepath=${encodeURIComponent(
        path
      )}/${encodeURIComponent(fileName)}&data=${encodeURIComponent(formatData(content, link, highlight))}&mode=append`;
    }

    open(target);
    popToRoot();
    showHUD("Note Captured", { clearRootSearch: true });
  }

  const [selectedText, setSelectedText] = useState<string>("");
  const [includeHighlight, setIncludeHighlight] = useState<boolean>(true);

  const [selectedResource, setSelectedResource] = useState<string>("");
  const [resourceInfo, setResourceInfo] = useState<string>("");

  useEffect(() => {
    const setText = async () => {
      try {
        const activeApp = await runAppleScript(GET_ACTIVE_APP_SCRIPT);
        if (SUPPORTED_BROWSERS.includes(activeApp)) {
          const linkInfoStr = await runAppleScript(GET_LINK_FROM_BROWSER_SCRIPT(activeApp));
          const [url, title] = linkInfoStr.split("\t");
          if (url && title) {
            setSelectedResource(url);
            setResourceInfo(title);
          }
        }
      } catch (error) {
        console.log(error);
      }

      try {
        const data = await getSelectedText();
        if (data) {
          setSelectedText(data);
        }
      } catch (error) {
        console.log(error);
      }
    };

    setText();
  }, []);

  useEffect(() => {
    if (selectedText && selectedResource) {
      showToast({
        style: Toast.Style.Success,
        title: "Highlighted text & Source captured",
      });
    } else if (selectedText) {
      showToast({
        style: Toast.Style.Success,
        title: "Highlighted text captured",
      });
    } else if (selectedResource) {
      showToast({
        style: Toast.Style.Success,
        title: "Link captured",
      });
    }
  }, [selectedText, selectedResource]);

  if (!ready) {
    return <List isLoading={true}></List>;
  } else if (allVaults.length === 0) {
    return <NoVaultFoundMessage />;
  } else if (vaultsWithPlugin.length === 0) {
    return <AdvancedURIPluginNotInstalled />;
  } else if (vaultsWithPlugin.length >= 1) {
    return (
      <Form
        actions={
          <ActionPanel>
            <Action.SubmitForm title="Capture" onSubmit={createNewNote} />
            <Action
              title="Clear Capture"
              shortcut={{ modifiers: ["opt"], key: "backspace" }}
              onAction={() => {
                setResourceInfo("");
                setSelectedResource("");
                setSelectedText("");
                showToast({
                  style: Toast.Style.Success,
                  title: "Capture Cleared",
                });
              }}
            />
          </ActionPanel>
        }
      >
        {ready && vaultsWithPlugin.length >= 1 && (
          <Form.Dropdown id="vault" title="Vault" defaultValue={defaultVault}>
            {vaultsWithPlugin.map((vault) => (
              <Form.Dropdown.Item key={vault.key} value={vault.name} title={vault.name} icon="🧳" />
            ))}
          </Form.Dropdown>
        )}
        {ready && (
          <Form.TextField
            id="path"
            title="Storage Path"
            defaultValue={defaultPath}
            info="Path where newly captured notes will be saved"
          />
        )}

        <Form.TextField title="Title" id="fileName" placeholder="Title for the resource" autoFocus />

        {selectedText && (
          <Form.Checkbox
            id="highlight"
            title="Include Highlight"
            label=""
            value={includeHighlight}
            onChange={setIncludeHighlight}
          />
        )}
        <Form.TextArea title="Note" id="content" placeholder={"Notes about the resource"} />
        {selectedResource && resourceInfo && (
          <Form.TagPicker id="link" title="Link" defaultValue={[selectedResource]}>
            <Form.TagPicker.Item
              value={selectedResource}
              title={resourceInfo}
              icon={{ source: Icon.Circle, tintColor: Color.Red }}
            />
          </Form.TagPicker>
        )}
        {selectedText && includeHighlight && <Form.Description title="Highlight" text={selectedText} />}
      </Form>
    );
  }
}
