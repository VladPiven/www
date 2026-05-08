export function calculateBudgetStatus(estimatedBudget, expensesList, endDateStr) {
    // Якщо витрат немає, сума 0
    const totalSpent = expensesList.reduce((sum, exp) => sum + (Number(exp.eurNormalizedValue) || 0), 0);
    
    const remainingBudget = estimatedBudget - totalSpent;
    const endDate = new Date(endDateStr);
    const today = new Date();
    
    const timeDiff = endDate.getTime() - today.getTime();
    let daysLeft = Math.ceil(timeDiff / (1000 * 3600 * 24));
    
    // Якщо подорож закінчилась або сьогодні останній день
    if (daysLeft <= 0) daysLeft = 1; 

    const dailyAllowance = remainingBudget > 0 ? (remainingBudget / daysLeft).toFixed(2) : 0;
    
    const percentageSpent = (totalSpent / estimatedBudget) * 100;
    let statusColor = "#00ff88"; // Зелений (норма)
    
    if (percentageSpent >= 100) statusColor = "#ff4757"; // Критично
    else if (percentageSpent >= 80) statusColor = "#ffa502"; // Попередження

    return { totalSpent, remainingBudget, dailyAllowance, statusColor };
}