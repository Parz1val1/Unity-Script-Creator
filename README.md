# Customized version of https://github.com/jchannon/csharpextensions, -> https://github.com/Parz1val1/Unity-Script-Creator

# Unity Script Creator

Welcome to Unity Script Creator. This VSCode extension provides extensions to the IDE that will hopefully speed up your development workflow.

## Features

**Add Unity Script**
Right click in folder structure and select `Unity C# script` to create a default Unity script.

**Add fields from constructors**

![Add fields from constructors](./featureimages/fieldfromctor.gif)

**Add constructor from properties**

![Add constructor from properties](./featureimages/ctorfromprop.gif)

**Add read-only property from constructors**

![Add read-only property from constructors](./featureimages/propfromctor.gif)

**Add property from constructors**

![Add property from constructors](./featureimages/fullpropfromctor.gif)

This extension traverses up the folder tree to find the project.json or *.csproj and uses that as the parent folder to determine namespaces.

-----------------------------------------------------------------------------------------------------------

## Licence

MIT

See [licence.txt](./licence.txt)
Legacy Repository: [jchannon/csharpextensions](https://github.com/jchannon/csharpextensions)
