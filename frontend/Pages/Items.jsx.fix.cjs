const fs = require('fs');
const path = 'c:/xampp/htdocs/SKU-Inventory-Manager/frontend/Pages/Items.jsx';

const newLogic = `  const handleMoveItem = async (targetFolder) => {
    // Determine items to move: either bulk selection or single item
    const itemsToMoveIds = selectedIds.size > 0 
      ? Array.from(selectedIds) 
      : (itemToMove ? [itemToMove.item_id || itemToMove.id] : []);

    if (itemsToMoveIds.length === 0) return;

    try {
      const movePromises = itemsToMoveIds.map(id => 
        updateItem(id, { product_folder: targetFolder })
      );

      await Promise.all(movePromises);

      const count = itemsToMoveIds.length;
      const folderName = targetFolder || 'Uncategorized';
      toast.success(\`Moved \${count} item\${count !== 1 ? 's' : ''} to \${folderName}\`);
      
      refetch();
      
      setShowMoveModal(false);
      setItemToMove(null);
      clearSelection();
    } catch (error) {
      console.error('Failed to move items:', error);
      toast.error('Failed to move items');
    }
  };`;

const oldStart = 'const handleMoveItem = async (targetFolder) => {';
const oldEnd = '  };';

try {
    let content = fs.readFileSync(path, 'utf8');

    // Find the function
    const startIndex = content.indexOf(oldStart);
    if (startIndex === -1) {
        console.error('Could not find start of function');
        process.exit(1);
    }

    // Find the end of the function (naive search for "  };" after start)
    // We know it ends before "if (loading) {"
    const nextFunction = 'if (loading) {';
    const endIndex = content.indexOf(nextFunction, startIndex);

    if (endIndex === -1) {
        console.error('Could not find end context');
        process.exit(1);
    }

    // Find the last closing brace before nextFunction
    const endOfFunction = content.lastIndexOf('  };', endIndex);

    if (endOfFunction === -1 || endOfFunction < startIndex) {
        console.error('Could not identify function bounds');
        process.exit(1);
    }

    const before = content.substring(0, startIndex);
    const after = content.substring(endOfFunction + 4); // 4 is length of "  };"

    const newContent = before + newLogic + after;

    fs.writeFileSync(path, newContent, 'utf8');
    console.log('Successfully updated Items.jsx');

} catch (err) {
    console.error(err);
    process.exit(1);
}
