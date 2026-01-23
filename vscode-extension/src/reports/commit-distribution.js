(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.buildSyntheticCommitsByHour = factory().buildSyntheticCommitsByHour;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function buildSyntheticCommitsByHour(totalCommits) {
    const commitsByHour = Array(24).fill(0);
    if (!Number.isFinite(totalCommits) || totalCommits <= 0) {
      return commitsByHour;
    }
    commitsByHour[9] = Math.ceil(totalCommits * 0.2);
    commitsByHour[11] = Math.ceil(totalCommits * 0.3);
    commitsByHour[14] = Math.ceil(totalCommits * 0.25);
    commitsByHour[16] = Math.ceil(totalCommits * 0.15);
    commitsByHour[19] = totalCommits - (
      commitsByHour[9] +
      commitsByHour[11] +
      commitsByHour[14] +
      commitsByHour[16]
    );
    return commitsByHour;
  }

  return { buildSyntheticCommitsByHour };
});
