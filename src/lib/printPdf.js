export function openPdfAndPrint(doc) {
  try {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);

    const printWindow = window.open(url, "_blank");

    if (!printWindow) {
      alert("Não foi possível abrir a impressão. Libere pop-ups no navegador.");
      return;
    }

    const runPrint = () => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (error) {
        console.error("Erro ao imprimir PDF:", error);
      }
    };

    printWindow.addEventListener("load", () => {
      setTimeout(runPrint, 500);
    });

    setTimeout(runPrint, 1200);

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
  } catch (error) {
    console.error("Erro ao preparar PDF para impressão:", error);
    alert("Não foi possível preparar o PDF para impressão.");
  }
}

export function openPrintWindow() {
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    alert("Não foi possível abrir a impressão. Libere pop-ups no navegador.");
    return null;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>Preparando impressão...</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 24px;
            color: #111827;
          }
        </style>
      </head>
      <body>
        <p>Preparando documento para impressão...</p>
      </body>
    </html>
  `);

  printWindow.document.close();
  return printWindow;
}

export function printPdfInWindow(doc, printWindow) {
  try {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);

    if (!printWindow || printWindow.closed) {
      alert("A janela de impressão foi fechada.");
      return;
    }

    printWindow.location.href = url;

    const runPrint = () => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (error) {
        console.error("Erro ao imprimir PDF:", error);
      }
    };

    printWindow.onload = () => {
      setTimeout(runPrint, 500);
    };

    setTimeout(runPrint, 1200);

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
  } catch (error) {
    console.error("Erro ao preparar PDF para impressão:", error);
    alert("Não foi possível preparar o PDF para impressão.");
  }
}