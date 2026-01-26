async function getInsights() {
    const [tab] =  await chrome.tabs.query({active:true})
    await chrome.scripting.executeScript({
        target:{tabId:tab.id},
        func: () => {
            alert("Hello, world!")
        }
    })
}

document.getElementById("getInsights").addEventListener("click", getInsights)